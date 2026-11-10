import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashDatos,
  minar,
  type FilaPersona,
} from '@bc/core';
import { Cola } from '../comun/cola.js';
import { dificultadPow } from '../comun/config.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

  constructor(private readonly prisma: PrismaService) {}

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
  agregarPersona(datos: DatosPersona) {
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
            // TODO(H4.1): cifrar con AES-256-GCM; por ahora texto plano provisional
            direccion_cifrada: datos.direccion,
            telefono_cifrado: datos.telefono,
            creado_en,
            creado_por: 'anonimo', // TODO(H3.x): el usuario autenticado
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

  listarCadena() {
    return this.prisma.bloque.findMany({ orderBy: { indice: 'asc' } });
  }

  listarPersonas() {
    return this.prisma.persona.findMany({ orderBy: { id: 'asc' } });
  }
}
