import { mkdirSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env solo: se lee el de la raíz del monorepo si existe.
try {
  process.loadEnvFile('../../.env');
} catch {
  // sin .env: se usan las variables del entorno o el valor por defecto
}
mkdirSync('data', { recursive: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? 'file:./data/blockchain.db' },
});
