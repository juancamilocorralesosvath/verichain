import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUTA_PLANTILLA = join(tmpdir(), 'bc-api-plantilla.db');
/** Llave de firma del servidor solo para las pruebas (en un archivo temporal, nunca en el repo). */
export const RUTA_LLAVE_SERVIDOR = join(tmpdir(), 'bc-api-llave-servidor.pem');

/** Crea una vez una BD con todas las migraciones aplicadas; cada archivo de prueba la copia. */
export default function setup(): void {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(RUTA_LLAVE_SERVIDOR, privateKey.export({ format: 'pem', type: 'pkcs8' }), {
    mode: 0o600,
  });
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
