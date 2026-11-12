import { Injectable, Logger } from '@nestjs/common';
import { HASH_CERO, hashEntradaBitacora, verificarBitacora, type EntradaBitacora } from '@bc/core';
import { Cola } from '../comun/cola.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const TAMANO_PAGINA = 50;

export interface DatosAuditoria {
  /** username, o '-' si no hay sesión. */
  usuario: string;
  accion: string;
  resultado: 'ok' | 'fallo';
  ip: string;
  /** Texto corto SIN datos personales ni secretos (p. ej. "bloque 7"). */
  detalle: string;
}

/** Quién y desde dónde: lo que cada controlador saca de la petición. */
export interface ContextoAuditoria {
  usuario: string;
  ip: string;
}

/** Quita saltos de línea y caracteres de control y acota el largo (la bitácora se muestra tal cual). */
const limpiar = (texto: string, maximo: number): string =>
  Array.from(texto, (c) => {
    const codigo = c.codePointAt(0) ?? 0;
    return codigo < 0x20 || codigo === 0x7f ? ' ' : c; // sin saltos de línea ni caracteres de control
  })
    .join('')
    .slice(0, maximo);

/**
 * Bitácora de auditoría append-only y encadenada con hash (diseño §5.10).
 * Solo expone `registrar()` y lectura. IMPORTANTE: no llamar a `registrar` dentro de una
 * transacción interactiva de Prisma (SQLite tiene una sola conexión y se bloquearía): se llama
 * después de que la transacción termina.
 */
@Injectable()
export class BitacoraService {
  private readonly logger = new Logger(BitacoraService.name);
  /** Cada entrada lee el último hash y encadena: una a la vez. */
  private readonly cola = new Cola();

  constructor(private readonly prisma: PrismaService) {}

  /** Si registrar falla, se anota en el log y la operación ya hecha no se revierte. */
  async registrar(datos: DatosAuditoria): Promise<void> {
    try {
      await this.cola.ejecutar(async () => {
        const ultimo = await this.prisma.bitacora.findFirst({ orderBy: { id: 'desc' } });
        const entrada: EntradaBitacora = {
          fecha: new Date().toISOString(),
          usuario: limpiar(datos.usuario, 100),
          accion: limpiar(datos.accion, 50),
          resultado: datos.resultado,
          ip: limpiar(datos.ip, 64),
          detalle: limpiar(datos.detalle, 200),
        };
        const hash = hashEntradaBitacora(ultimo?.hash ?? HASH_CERO, entrada);
        await this.prisma.bitacora.create({ data: { ...entrada, hash } });
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar "${datos.accion}" en la bitácora: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  /** Una página (las más recientes primero) y la verificación de TODA la bitácora. */
  async listar(pagina: number) {
    const todas = await this.prisma.bitacora.findMany({ orderBy: { id: 'asc' } });
    const verificacion = verificarBitacora(todas);
    const total = todas.length;
    const entradas = todas
      .slice()
      .reverse()
      .slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA)
      .map((e) => ({
        id: e.id,
        fecha: e.fecha,
        usuario: e.usuario,
        accion: e.accion,
        resultado: e.resultado,
        ip: e.ip,
        detalle: e.detalle,
        hash: e.hash,
      }));
    return {
      entradas,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANO_PAGINA)),
      total,
      verificacion,
    };
  }
}
