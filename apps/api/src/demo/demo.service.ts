import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ConflictException, Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import type { ReporteCadena } from '@bc/core';
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
  ) {}

  private rutaBd(): string {
    const url = process.env['DATABASE_URL'] ?? 'file:./data/blockchain.db';
    return resolve(url.replace(/^file:/, ''));
  }

  private rutaSnapshot(): string {
    return join(dirname(this.rutaBd()), 'snapshot.db');
  }

  /** Guarda una copia de la BD en `snapshot.db` (junto a la BD), reemplazando la anterior. */
  snapshot(): Promise<{ guardado: true; bloques: number }> {
    return this.cadena.serializar(async () => {
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
  }

  /** Reemplaza el contenido de la BD por el del snapshot y devuelve el resultado de verificar. */
  restaurar(): Promise<{ restaurado: true; verificacion: ReporteCadena }> {
    return this.cadena.serializar(async () => {
      if (!existsSync(this.rutaSnapshot())) {
        throw new ConflictException('No hay snapshot: guarda uno antes de restaurar');
      }
      const origen = new Database(this.rutaSnapshot(), { readonly: true, fileMustExist: true });
      try {
        await origen.backup(this.rutaBd()); // SQLite coordina con la conexión abierta de Prisma
      } finally {
        origen.close();
      }
      // TODO(H7.2): registrar la restauración en la bitácora
      return { restaurado: true as const, verificacion: await this.cadena.verificarSinCola() };
    });
  }
}
