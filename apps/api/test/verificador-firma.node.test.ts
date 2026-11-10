import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verificarFirmaNode } from '../src/cripto/verificador-firma.node.js';

const par = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spkiB64 = par.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const firmar = (mensaje: string): string =>
  sign('sha256', Buffer.from(mensaje), { key: par.privateKey, dsaEncoding: 'ieee-p1363' }).toString(
    'base64',
  );

describe('verificarFirmaNode', () => {
  const mensaje = 'a'.repeat(64);

  it('acepta una firma válida (ECDSA P-256, formato P1363)', async () => {
    expect(await verificarFirmaNode(spkiB64, mensaje, firmar(mensaje))).toBe(true);
  });

  it('rechaza una firma alterada', async () => {
    const bytes = Buffer.from(firmar(mensaje), 'base64');
    bytes[0] = (bytes[0] as number) ^ 0xff;
    expect(await verificarFirmaNode(spkiB64, mensaje, bytes.toString('base64'))).toBe(false);
  });

  it('rechaza si el mensaje cambió', async () => {
    expect(await verificarFirmaNode(spkiB64, 'b'.repeat(64), firmar(mensaje))).toBe(false);
  });

  it('rechaza si la llave es otra', async () => {
    const otra = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64');
    expect(await verificarFirmaNode(otra, mensaje, firmar(mensaje))).toBe(false);
  });

  it('entradas mal formadas dan false sin lanzar', async () => {
    expect(await verificarFirmaNode('no-es-una-llave', mensaje, firmar(mensaje))).toBe(false);
    expect(await verificarFirmaNode(spkiB64, mensaje, '!!!')).toBe(false);
    expect(await verificarFirmaNode(spkiB64, mensaje, '')).toBe(false);
  });

  it('acepta una firma hecha con WebCrypto (como la hará el navegador)', async () => {
    const { subtle } = globalThis.crypto;
    const web = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const spki = Buffer.from(await subtle.exportKey('spki', web.publicKey)).toString('base64');
    const firma = Buffer.from(
      await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        web.privateKey,
        new TextEncoder().encode(mensaje),
      ),
    ).toString('base64');
    expect(await verificarFirmaNode(spki, mensaje, firma)).toBe(true);
  });
});
