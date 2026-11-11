import { createPrivateKey, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../scripts/llaves-servidor.mjs');
const ejecutar = (ruta: string): string =>
  execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, SERVER_SIGNING_KEY_PATH: ruta },
    encoding: 'utf8',
    stdio: 'pipe',
  });

describe('npm run llaves:servidor', () => {
  it('crea la privada (PKCS8, EC P-256, modo 600) y la pública, y no las sobrescribe', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'bc-script-'));
    const privada = join(carpeta, 'secrets', 'server-signing-key.pem');
    const publica = join(carpeta, 'secrets', 'server-public.pem');

    ejecutar(privada);
    expect(existsSync(privada) && existsSync(publica)).toBe(true);
    expect(readFileSync(privada, 'utf8')).toMatch(/^-----BEGIN PRIVATE KEY-----/); // PKCS8
    const clave = createPrivateKey(readFileSync(privada));
    expect(clave.asymmetricKeyType).toBe('ec');
    expect(clave.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
    expect(readFileSync(publica, 'utf8')).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(readFileSync(publica, 'utf8')).not.toMatch(/PRIVATE/);
    expect(
      createPublicKey(clave)
        .export({ format: 'der', type: 'spki' })
        .equals(createPublicKey(readFileSync(publica)).export({ format: 'der', type: 'spki' })),
    ).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(privada).mode & 0o777).toBe(0o600);
    }

    const antes = readFileSync(privada, 'utf8');
    const salida = ejecutar(privada); // segunda vez: no sobrescribe
    expect(salida).toMatch(/ya existen/i);
    expect(readFileSync(privada, 'utf8')).toBe(antes);
  });

  it('si falta solo una de las dos llaves falla sin tocar la que existe', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'bc-script-'));
    const privada = join(carpeta, 'k.pem');
    ejecutar(privada);
    const antes = readFileSync(privada, 'utf8');
    rmSync(join(carpeta, 'server-public.pem'));
    expect(() => ejecutar(privada)).toThrow();
    expect(readFileSync(privada, 'utf8')).toBe(antes);
  });
});
