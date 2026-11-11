import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FirmaServidorService } from '../src/cripto/firma-servidor.service.js';
import { verificarFirmaNode } from '../src/cripto/verificador-firma.node.js';

const carpeta = mkdtempSync(join(tmpdir(), 'bc-firma-'));
function escribir(nombre: string, contenido: string): string {
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}
const pemEc = (curva: string): string =>
  generateKeyPairSync('ec', { namedCurve: curva })
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
const pemRsa = (): string =>
  generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();

describe('FirmaServidorService', () => {
  const rutaValida = escribir('valida.pem', pemEc('prime256v1'));

  it('una llave inexistente da un error que nombra el script', () => {
    expect(() => new FirmaServidorService(join(carpeta, 'no-existe.pem'))).toThrow(
      /llaves:servidor/,
    );
  });

  it.each([
    ['un archivo que no es una llave', () => escribir('basura.pem', 'esto no es un PEM')],
    ['una llave RSA', () => escribir('rsa.pem', pemRsa())],
    ['una llave EC de otra curva (P-384)', () => escribir('p384.pem', pemEc('secp384r1'))],
  ])('rechaza %s', (_n, crear) => {
    expect(() => new FirmaServidorService(crear())).toThrow(/llaves:servidor/);
  });

  it('firma el sello y la firma verifica con la pública (P1363)', async () => {
    const servicio = new FirmaServidorService(rutaValida);
    const hash = 'ab'.repeat(32);
    const firma = servicio.firmarSello(3, hash);
    expect(Buffer.from(firma, 'base64')).toHaveLength(64);
    expect(await verificarFirmaNode(servicio.llavePublicaSpkiB64(), `3:${hash}`, firma)).toBe(true);
    expect(await verificarFirmaNode(servicio.llavePublicaSpkiB64(), `4:${hash}`, firma)).toBe(
      false,
    );
  });

  it('expone solo la pública: PEM público y huella SHA-256 del SPKI', () => {
    const servicio = new FirmaServidorService(rutaValida);
    const der = Buffer.from(servicio.llavePublicaSpkiB64(), 'base64');
    expect(servicio.llavePublicaPem()).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(servicio.llavePublicaPem()).not.toMatch(/PRIVATE/);
    expect(servicio.huellaSha256Hex()).toBe(createHash('sha256').update(der).digest('hex'));
  });

  it('serializar el servicio no revela la privada', () => {
    const servicio = new FirmaServidorService(rutaValida);
    expect(JSON.stringify(servicio)).toBe('{}');
  });
});
