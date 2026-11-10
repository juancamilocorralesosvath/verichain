import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUTA_PLANTILLA = join(tmpdir(), 'bc-api-plantilla.db');

/** Crea una vez una BD con todas las migraciones aplicadas; cada archivo de prueba la copia. */
export default function setup(): void {
  rmSync(RUTA_PLANTILLA, { force: true });
  // En Windows, crear el archivo primero evita el fallo del motor al crear SQLite.
  writeFileSync(RUTA_PLANTILLA, '');
  execFileSync(
    process.execPath,
    [import.meta.dirname + '/../../../node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: import.meta.dirname + '/..',
      env: { ...process.env, DATABASE_URL: `file:${RUTA_PLANTILLA}` },
      stdio: 'pipe',
    },
  );
}
