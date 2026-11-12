import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ConflictException, Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import type { ReporteCadena } from '@bc/core';
import { BitacoraService, type ContextoAuditoria } from '../bitacora/bitacora.service.js';
import { CadenaService } from '../cadena/cadena.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Snapshot y "Restaurar demo" (solo con DEMO_MODE). Usa la API de backup de SQLite, que copia la
 * base de forma consistente aunque Prisma tenga su conexión abierta: no se copia el archivo a mano.
 * Restaurar es, conceptualmente, el rollback que el diseño acepta como riesgo (§7b).
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly cadena: CadenaService,
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
  ) {}

  private rutaBd(): string {
    const url = process.env['DATABASE_URL'] ?? 'file:./data/blockchain.db';
    return resolve(url.replace(/^file:/, ''));
  }

  private rutaSnapshot(): string {
    return join(dirname(this.rutaBd()), 'snapshot.db');
  }

  /** Guarda una copia de la BD en `snapshot.db` (junto a la BD), reemplazando la anterior. */
  async snapshot(ctx: ContextoAuditoria): Promise<{ guardado: true; bloques: number }> {
    const resultado = await this.cadena.serializar(async () => {
      const destino = this.rutaSnapshot();
      const origen = new Database(this.rutaBd(), { readonly: true, fileMustExist: true });
      try {
        rmSync(destino, { force: true });
        await origen.backup(destino);
      } finally {
        origen.close();
      }
      return { guardado: true as const, bloques: await this.prisma.bloque.count() };
    });
    await this.bitacora.registrar({
      ...ctx,
      accion: 'snapshot',
      resultado: 'ok',
      detalle: `bloques ${resultado.bloques}`,
    });
    return resultado;
  }

  /** Reemplaza el contenido de la BD por el del snapshot y devuelve el resultado de verificar. */
  async restaurar(
    ctx: ContextoAuditoria,
  ): Promise<{ restaurado: true; verificacion: ReporteCadena }> {
    const resultado = await this.cadena.serializar(async () => {
      if (!existsSync(this.rutaSnapshot())) {
        throw new ConflictException('No hay snapshot: guarda uno antes de restaurar');
      }
      const origen = new Database(this.rutaSnapshot(), { readonly: true, fileMustExist: true });
      try {
        await origen.backup(this.rutaBd()); // SQLite coordina con la conexión abierta de Prisma
      } finally {
        origen.close();
      }
      return { restaurado: true as const, verificacion: await this.cadena.verificarSinCola() };
    });
    // la bitácora también volvió al estado del snapshot: esta entrada se encadena sobre ese estado
    await this.bitacora.registrar({
      ...ctx,
      accion: 'restaurar',
      resultado: 'ok',
      detalle: `bloques ${resultado.verificacion.totalBloques}, válida: ${resultado.verificacion.valida ? 'sí' : 'no'}`,
    });
    return resultado;
  }
}
