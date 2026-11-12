import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashDatos,
  minar,
  verificarCadena,
  FORMATO_EXPORTACION,
  type BloqueCadena,
  type Exportacion,
  type FilaPersona,
  type ReporteCadena,
  type Sello,
} from '@bc/core';
import { Cola } from '../comun/cola.js';
import { dificultadPow } from '../comun/config.js';
import { LlavesService } from '../llaves/llaves.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CifradoService } from '../cripto/cifrado.service.js';
import { FirmaServidorService } from '../cripto/firma-servidor.service.js';
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
    private readonly firmaServidor: FirmaServidorService,
  ) {}

  /** Génesis automático: solo si la cadena está vacía. */
  async onModuleInit(): Promise<void> {
    await this.cola.ejecutar(async () => {
      if ((await this.prisma.bloque.count()) > 0) return;
      const minado = minar(HASH_CERO, HASH_DATOS_GENESIS, dificultadPow());
      // el génesis y su sello se crean juntos
      await this.prisma.$transaction(async (tx) => {
        await tx.bloque.create({
          data: {
            indice: 0,
            hash_datos: HASH_DATOS_GENESIS,
            nonce: minado.nonce,
            hash_anterior: HASH_CERO,
            hash_cadena: minado.hashCadena,
            creado_en: new Date().toISOString(),
          },
        });
        await tx.sello.create({
          data: {
            indice: 0,
            hash_cadena: minado.hashCadena,
            firma: this.firmaServidor.firmarSello(0, minado.hashCadena),
          },
        });
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
    // el sello del nuevo último bloque va en la misma transacción que el anexo
    await tx.sello.create({
      data: {
        indice: bloque.indice,
        hash_cadena: bloque.hash_cadena,
        firma: this.firmaServidor.firmarSello(bloque.indice, bloque.hash_cadena),
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
   * Recalcula todos los hashes en vivo a partir de la fila ACTUAL de cada persona y verifica las
   * firmas de los usuarios y el sello del servidor. Va por la misma cola que los anexos para no
   * leer una cadena a medio anexar.
   */
  verificar(): Promise<ReporteCadena> {
    return this.cola.ejecutar(() => this.verificarSinCola());
  }

  /** Lee la cadena, las llaves de los usuarios y el sello vigente (sin pasar por la cola). */
  private async leerEstado() {
    const filas = await this.prisma.bloque.findMany({
      orderBy: { indice: 'asc' },
      include: { persona: true },
    });
    // Mapeo explícito: no se cuela ningún campo interno de Prisma (id, persona_id...).
    // La persona siempre lleva dirección y teléfono CIFRADOS: nunca se descifra aquí.
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
    const vigente = await this.prisma.sello.findFirst({ orderBy: { id: 'desc' } });
    const sello: Sello | null = vigente && {
      indice: vigente.indice,
      hash_cadena: vigente.hash_cadena,
      firma: vigente.firma,
    };
    return { bloques, llavesUsuarios, sello };
  }

  /** Verificación completa sin pasar por la cola: solo para quien ya está dentro de ella. */
  async verificarSinCola(): Promise<ReporteCadena> {
    const { bloques, llavesUsuarios, sello } = await this.leerEstado();
    const reporte = await verificarCadena(bloques, {
      dificultad: dificultadPow(),
      llavesUsuarios,
      verificarFirma: verificarFirmaNode,
      sello,
      llavePublicaServidor: this.firmaServidor.llavePublicaSpkiB64(),
    });
    // Sin ningún sello el core responde "no aplica"; aquí falta por completo, y eso no se puede
    // aceptar (si no, borrar la tabla de sellos silenciaría la detección).
    if (!sello) {
      return {
        ...reporte,
        valida: false,
        sello: {
          estado: 'falla',
          motivos: ['No existe ningún sello del servidor: la cadena no se puede dar por íntegra'],
        },
      };
    }
    return reporte;
  }

  /**
   * Exportación `bc-export/1` para el verificador independiente (§5.9): la cadena con las filas
   * cifradas, las llaves de los usuarios, el sello y la llave pública del servidor con su huella.
   */
  exportar(): Promise<Exportacion> {
    return this.cola.ejecutar(async () => {
      const { bloques, llavesUsuarios, sello } = await this.leerEstado();
      return {
        formato: FORMATO_EXPORTACION,
        exportado_en: new Date().toISOString(),
        dificultad: dificultadPow(),
        bloques,
        llaves_usuarios: Object.fromEntries(
          Object.entries(llavesUsuarios).map(([id, spki]) => [id, spki]),
        ),
        sello,
        llave_servidor_spki_b64: this.firmaServidor.llavePublicaSpkiB64(),
        huella_llave_servidor: this.firmaServidor.huellaSha256Hex(),
      };
    });
  }

  /** Antes de anexar: si la cadena no verifica por completo, no se escribe nada (409). */
  async exigirCadenaIntegra(): Promise<void> {
    if (!(await this.verificarSinCola()).valida) {
      throw new ConflictException('Cadena comprometida: restaure antes de continuar');
    }
  }

  /** Clave pública del servidor para quien quiera verificar el sello por su cuenta. */
  llaveServidor(): { pem: string; huella_sha256: string } {
    return {
      pem: this.firmaServidor.llavePublicaPem(),
      huella_sha256: this.firmaServidor.huellaSha256Hex(),
    };
  }

  listarCadena() {
    return this.prisma.bloque.findMany({ orderBy: { indice: 'asc' } });
  }

  listarPersonas() {
    return this.prisma.persona.findMany({ orderBy: { id: 'asc' } });
  }
}
