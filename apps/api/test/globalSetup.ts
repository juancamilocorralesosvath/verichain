import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUTA_PLANTILLA = join(tmpdir(), 'bc-api-plantilla.db');

/** Crea una vez una BD con todas las migraciones aplicadas; cada archivo de prueba la copia. */
export default function setup(): void {
  rmSync(RUTA_PLANTILLA, { force: true });
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: import.meta.dirname + '/..',
    env: { ...process.env, DATABASE_URL: `file:${RUTA_PLANTILLA}` },
    stdio: 'pipe',
  });
}
