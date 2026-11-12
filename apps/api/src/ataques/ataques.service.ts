import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calcularHashDatos, minar, HASH_CERO } from '@bc/core';
import { BitacoraService, type ContextoAuditoria } from '../bitacora/bitacora.service.js';
import { CadenaService } from '../cadena/cadena.service.js';
import { dificultadPow } from '../comun/config.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AtaqueInfo {
  id: string;
  nombre: string;
  descripcion: string;
  deteccionEsperada: string;
}

const CATALOGO: AtaqueInfo[] = [
  {
    id: 'modificar-dato',
    nombre: 'Modificar un dato',
    descripcion:
      'Cambia el nombre de una persona directamente en la tabla, sin pasar por la aplicación.',
    deteccionEsperada: 'Falla hashDatos (y hashCadena) del bloque atacado.',
  },
  {
    id: 'modificar-cifrado',
    nombre: 'Modificar un texto cifrado',
    descripcion: 'Cambia un carácter del teléfono cifrado de una persona.',
    deteccionEsperada:
      'Falla hashDatos del bloque; además el descifrado AES-GCM de ese campo ya no pasa la etiqueta.',
  },
  {
    id: 'reescribir-cadena',
    nombre: 'Alterar un dato y recalcular todo',
    descripcion:
      'Cambia un dato y recalcula hash_datos, el PoW y el encadenamiento de ese bloque hasta el final.',
    deteccionEsperada:
      'Los hashes, el enlace y el PoW cuadran, pero falla la firma del usuario en el bloque y falla el sello del servidor.',
  },
  {
    id: 'truncar',
    nombre: 'Borrar el último bloque',
    descripcion: 'Elimina el último bloque y su persona.',
    deteccionEsperada:
      'La cadena restante parece válida, pero el sello del servidor detecta el truncamiento.',
  },
  {
    id: 'reordenar',
    nombre: 'Intercambiar dos bloques',
    descripcion: 'Intercambia el contenido de dos bloques consecutivos sin cambiar sus índices.',
    deteccionEsperada: 'Falla el enlace con el hash anterior en el primer bloque intercambiado.',
  },
];

@Injectable()
export class AtaquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadena: CadenaService,
    private readonly bitacora: BitacoraService,
  ) {}

  catalogo(): AtaqueInfo[] {
    return CATALOGO;
  }

  /**
   * Ejecuta el ataque escribiendo directo en la BD con Prisma, saltándose la lógica de la
   * aplicación (como lo haría alguien con acceso a la base). Va por la cola de anexos.
   */
  async ejecutar(
    id: string,
    indiceSolicitado: number | undefined,
    ctx: ContextoAuditoria,
  ): Promise<{ ejecutado: true; detalle: string }> {
    if (!CATALOGO.some((a) => a.id === id)) throw new NotFoundException('Recurso no encontrado');
    try {
      const resultado = await this.ejecutarEnCola(id, indiceSolicitado);
      await this.bitacora.registrar({
        ...ctx,
        accion: 'ataque',
        resultado: 'ok',
        detalle: `${id}: ${resultado.detalle}`,
      });
      return resultado;
    } catch (error) {
      await this.bitacora.registrar({
        ...ctx,
        accion: 'ataque',
        resultado: 'fallo',
        detalle: `${id}: ${error instanceof Error ? error.message : 'error'}`,
      });
      throw error;
    }
  }

  private ejecutarEnCola(
    id: string,
    indiceSolicitado?: number,
  ): Promise<{ ejecutado: true; detalle: string }> {
    return this.cadena.serializar(async () => {
      const ultimo =
        (await this.prisma.bloque.aggregate({ _max: { indice: true } }))._max.indice ?? 0;
      if (ultimo < 1) throw new BadRequestException('La cadena solo tiene el génesis');
      const indice = indiceSolicitado ?? 1;
      if (indice < 1 || indice > ultimo) throw new BadRequestException('Índice fuera de rango');
      const detalle = await this.aplicar(id, indice, ultimo);
      return { ejecutado: true as const, detalle };
    });
  }

  private async personaDe(indice: number) {
    const bloque = await this.prisma.bloque.findUniqueOrThrow({
      where: { indice },
      include: { persona: true },
    });
    if (!bloque.persona) throw new BadRequestException('Ese bloque no tiene persona');
    return bloque.persona;
  }

  private async aplicar(id: string, indice: number, ultimo: number): Promise<string> {
    switch (id) {
      case 'modificar-dato': {
        const persona = await this.personaDe(indice);
        await this.prisma.persona.update({
          where: { id: persona.id },
          data: { nombre: 'Nombre alterado' },
        });
        return `Se cambió el nombre de la persona del bloque ${indice} directamente en la BD`;
      }
      case 'modificar-cifrado': {
        const persona = await this.personaDe(indice);
        const texto = persona.telefono_cifrado;
        const posicion = 20; // dentro del IV/etiqueta/texto: siempre es base64 válido
        const nuevo = texto[posicion] === 'A' ? 'B' : 'A';
        await this.prisma.persona.update({
          where: { id: persona.id },
          data: { telefono_cifrado: texto.slice(0, posicion) + nuevo + texto.slice(posicion + 1) },
        });
        return `Se alteró un carácter del teléfono cifrado de la persona del bloque ${indice}`;
      }
      case 'reescribir-cadena': {
        const persona = await this.personaDe(indice);
        await this.prisma.persona.update({
          where: { id: persona.id },
          data: { nombre: 'Nombre alterado' },
        });
        await this.recalcularDesde(indice);
        return `Se cambió un dato del bloque ${indice} y se recalcularon hash_datos, PoW y enlaces hasta el bloque ${ultimo}`;
      }
      case 'truncar': {
        const bloque = await this.prisma.bloque.findUniqueOrThrow({ where: { indice: ultimo } });
        await this.prisma.bloque.delete({ where: { indice: ultimo } });
        if (bloque.persona_id !== null) {
          await this.prisma.persona.delete({ where: { id: bloque.persona_id } });
        }
        return `Se borró el último bloque (${ultimo}) y su persona`;
      }
      case 'reordenar': {
        if (indice + 1 > ultimo)
          throw new BadRequestException('No hay un bloque siguiente para intercambiar');
        await this.intercambiar(indice, indice + 1);
        return `Se intercambió el contenido de los bloques ${indice} y ${indice + 1} sin cambiar sus índices`;
      }
      default:
        throw new NotFoundException('Recurso no encontrado');
    }
  }

  /** Recalcula hash_datos, PoW y enlaces desde `desde` hasta el final, como lo haría un atacante con core. */
  private async recalcularDesde(desde: number): Promise<void> {
    const filas = await this.prisma.bloque.findMany({
      orderBy: { indice: 'asc' },
      include: { persona: true },
    });
    let anterior = filas[desde - 1]?.hash_cadena ?? HASH_CERO;
    for (const b of filas.filter((f) => f.indice >= desde)) {
      const hash_datos = b.persona
        ? calcularHashDatos({
            cedula: b.persona.cedula,
            nombre: b.persona.nombre,
            direccion_cifrada: b.persona.direccion_cifrada,
            telefono_cifrado: b.persona.telefono_cifrado,
            creado_en: b.persona.creado_en,
            creado_por: b.persona.creado_por,
          })
        : b.hash_datos;
      const minado = minar(anterior, hash_datos, dificultadPow());
      await this.prisma.bloque.update({
        where: { indice: b.indice },
        data: {
          hash_datos,
          hash_anterior: anterior,
          nonce: minado.nonce,
          hash_cadena: minado.hashCadena,
        },
      });
      anterior = minado.hashCadena;
    }
  }

  /** Intercambia el contenido de dos bloques (persona, hashes, nonce, firma) sin tocar sus índices. */
  private async intercambiar(i: number, j: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.bloque.findUniqueOrThrow({ where: { indice: i } });
      const b = await tx.bloque.findUniqueOrThrow({ where: { indice: j } });
      const contenido = (x: typeof a) => ({
        persona_id: x.persona_id,
        hash_datos: x.hash_datos,
        nonce: x.nonce,
        hash_anterior: x.hash_anterior,
        hash_cadena: x.hash_cadena,
        firma_usuario: x.firma_usuario,
        llave_id: x.llave_id,
        creado_en: x.creado_en,
      });
      // persona_id es único: se libera antes de reasignarlo
      await tx.bloque.update({ where: { indice: i }, data: { persona_id: null } });
      await tx.bloque.update({ where: { indice: j }, data: contenido(a) });
      await tx.bloque.update({ where: { indice: i }, data: contenido(b) });
    });
  }
}
