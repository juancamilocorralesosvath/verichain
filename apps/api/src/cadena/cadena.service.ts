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
import { verificarFirmaNode } from '../cripto/verificador-firma.node.js';
import type { Prisma } from '../generated/prisma/client.js';

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

  /** Ejecuta una tarea en la cola de anexos: una a la vez, en el orden en que llegan. */
  serializar<T>(tarea: () => Promise<T>): Promise<T> {
    return this.cola.ejecutar(tarea);
  }

  /** Arma la fila de la persona con dirección y teléfono cifrados y calcula su `hash_datos`. */
  construirFila(
    datos: DatosPersona,
    creado_por: string,
  ): { fila: FilaPersona; hash_datos: string } {
    const fila: FilaPersona = {
      cedula: datos.cedula,
      nombre: datos.nombre,
      direccion_cifrada: this.cifrado.cifrar(datos.direccion),
      telefono_cifrado: this.cifrado.cifrar(datos.telefono),
      creado_en: new Date().toISOString(),
      creado_por,
    };
    return { fila, hash_datos: calcularHashDatos(fila) };
  }

  /**
   * Mina e inserta la persona y su bloque firmado. Debe llamarse dentro de `serializar` y de una
   * transacción de Prisma (el llamador la abre y puede borrar el borrador en la misma).
   */
  async anexarBloqueTx(
    tx: Prisma.TransactionClient,
    fila: FilaPersona,
    hash_datos: string,
    firma_usuario: string,
    llave_id: number,
  ) {
    if (await tx.persona.findUnique({ where: { cedula: fila.cedula } })) {
      throw new ConflictException('Registro duplicado');
    }
    if (calcularHashDatos(fila) !== hash_datos) {
      throw new Error('La fila del borrador no coincide con su hash');
    }
    const ultimo = await tx.bloque.findFirst({ orderBy: { indice: 'desc' } });
    if (!ultimo) throw new Error('La cadena no tiene génesis');
    const minado = minar(ultimo.hash_cadena, hash_datos, dificultadPow());

    const persona = await tx.persona.create({ data: fila });
    const bloque = await tx.bloque.create({
      data: {
        indice: ultimo.indice + 1,
        persona_id: persona.id,
        hash_datos,
        nonce: minado.nonce,
        hash_anterior: ultimo.hash_cadena,
        hash_cadena: minado.hashCadena,
        firma_usuario,
        llave_id,
        creado_en: fila.creado_en,
      },
    });
    return {
      indice: bloque.indice,
      persona_id: persona.id,
      hash_datos: bloque.hash_datos,
      hash_cadena: bloque.hash_cadena,
    };
  }

  /**
   * Recalcula todos los hashes en vivo a partir de la fila ACTUAL de cada persona.
   * Va por la misma cola que los anexos para no leer una cadena a medio anexar.
   * Verifica también las firmas de los usuarios; el sello del servidor llega con H5.4.
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
      // llavesUsuarios incluye las llaves aprobadas y las reemplazadas (los bloques viejos siguen verificando)
      const llavesUsuarios = await this.llaves.llavesParaVerificacion();
      return verificarCadena(bloques, {
        dificultad: dificultadPow(),
        llavesUsuarios,
        verificarFirma: verificarFirmaNode,
      });
    });
  }

  listarCadena() {
    return this.prisma.bloque.findMany({ orderBy: { indice: 'asc' } });
  }

  listarPersonas() {
    return this.prisma.persona.findMany({ orderBy: { id: 'asc' } });
  }
}
