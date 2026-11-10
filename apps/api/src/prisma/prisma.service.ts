import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

/** Cliente Prisma sobre SQLite (consultas parametrizadas; nunca $queryRawUnsafe). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env['DATABASE_URL'] ?? 'file:./data/blockchain.db';
    const ruta = url.replace(/^file:/, '');
    mkdirSync(dirname(ruta), { recursive: true });
    super({ adapter: new PrismaBetterSqlite3({ url }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
