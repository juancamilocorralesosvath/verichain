import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashDatos,
  minar,
  verificarCadena,
  type BloqueCadena,
  type FilaPersona,
  type ReporteCadena,
} from '@bc/core';
import { Cola } from '../comun/cola.js';
import { dificultadPow } from '../comun/config.js';
import { LlavesService } from '../llaves/llaves.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CifradoService } from '../cripto/cifrado.service.js';

export interface DatosPersona {
  cedula: string;
  nombre: string;
  direccion: string;
  telefono: string;
}

@Injectable()
export class CadenaService implements OnModuleInit {
  /** Serializa los anexos: un solo servidor, un anexo a la vez. */
  private readonly cola = new Cola();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cifrado: CifradoService,
    private readonly llaves: LlavesService,
  ) {}

  /** Génesis automático: solo si la cadena está vacía. */
  async onModuleInit(): Promise<void> {
    await this.cola.ejecutar(async () => {
      if ((await this.prisma.bloque.count()) > 0) return;
      const minado = minar(HASH_CERO, HASH_DATOS_GENESIS, dificultadPow());
      await this.prisma.bloque.create({
        data: {
          indice: 0,
          hash_datos: HASH_DATOS_GENESIS,
          nonce: minado.nonce,
          hash_anterior: HASH_CERO,
          hash_cadena: minado.hashCadena,
          creado_en: new Date().toISOString(),
        },
      });
    });
  }

  /** Crea la persona y su bloque en una sola transacción, serializada con los demás anexos. */
  agregarPersona(datos: DatosPersona, creado_por: string) {
    return this.cola.ejecutar(async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (await tx.persona.findUnique({ where: { cedula: datos.cedula } })) {
            throw new ConflictException('Registro duplicado');
          }
          const ultimo = await tx.bloque.findFirst({ orderBy: { indice: 'desc' } });
          if (!ultimo) throw new Error('La cadena no tiene génesis');

          const creado_en = new Date().toISOString();
          const fila: FilaPersona = {
            cedula: datos.cedula,
            nombre: datos.nombre,
            direccion_cifrada: this.cifrado.cifrar(datos.direccion),
            telefono_cifrado: this.cifrado.cifrar(datos.telefono),
            creado_en,
            creado_por,
          };
          const hash_datos = calcularHashDatos(fila);
          const minado = minar(ultimo.hash_cadena, hash_datos, dificultadPow());

          const persona = await tx.persona.create({ data: fila });
          await tx.bloque.create({
            data: {
              indice: ultimo.indice + 1,
              persona_id: persona.id,
              hash_datos,
              nonce: minado.nonce,
              hash_anterior: ultimo.hash_cadena,
              hash_cadena: minado.hashCadena,
              creado_en,
            },
          });
          return persona;
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException('Registro duplicado');
        }
        throw error;
      }
    });
  }

  /**
   * Recalcula todos los hashes en vivo a partir de la fila ACTUAL de cada persona.
   * Va por la misma cola que los anexos para no leer una cadena a medio anexar.
   * Aún sin firmas ni sello (H5.x): esos chequeos quedan en 'no-aplica'.
   */
  verificar(): Promise<ReporteCadena> {
    return this.cola.ejecutar(async () => {
      const filas = await this.prisma.bloque.findMany({
        orderBy: { indice: 'asc' },
        include: { persona: true },
      });
      // Mapeo explícito: no se cuela ningún campo interno de Prisma (id, persona_id...).
      const bloques: BloqueCadena[] = filas.map((b) => ({
        indice: b.indice,
        hash_datos: b.hash_datos,
        nonce: b.nonce,
        hash_anterior: b.hash_anterior,
        hash_cadena: b.hash_cadena,
        firma_usuario: b.firma_usuario,
        llave_id: b.llave_id,
        persona: b.persona && {
          cedula: b.persona.cedula,
          nombre: b.persona.nombre,
          direccion_cifrada: b.persona.direccion_cifrada,
          telefono_cifrado: b.persona.telefono_cifrado,
          creado_en: b.persona.creado_en,
          creado_por: b.persona.creado_por,
        },
      }));
      // llavesUsuarios ya incluye aprobadas y reemplazadas; sin `verificarFirma` (H5.3/H5.4) no se usan aún.
      const llavesUsuarios = await this.llaves.llavesParaVerificacion();
      return verificarCadena(bloques, { dificultad: dificultadPow(), llavesUsuarios });
    });
  }

  listarCadena() {
    return this.prisma.bloque.findMany({ orderBy: { indice: 'asc' } });
  }

  listarPersonas() {
    return this.prisma.persona.findMany({ orderBy: { id: 'asc' } });
  }
}
