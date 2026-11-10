import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RUTA_PLANTILLA } from './globalSetup.js';

/** BD propia para un archivo de prueba (copia de la plantilla migrada). Devuelve su DATABASE_URL. */
export function crearBdTemporal(): string {
  const ruta = join(mkdtempSync(join(tmpdir(), 'bc-api-')), 'prueba.db');
  copyFileSync(RUTA_PLANTILLA, ruta);
  process.env['DATABASE_URL'] = `file:${ruta}`;
  process.env['POW_DIFFICULTY'] = '2';
  return process.env['DATABASE_URL'];
}
