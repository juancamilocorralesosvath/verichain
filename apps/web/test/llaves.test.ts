// @vitest-environment node
import { verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ErrorRespaldo,
  crearRespaldo,
  exportarPublicaSpkiB64,
  firmarHashDatos,
  generarPar,
  huellaSpkiHex,
  importarRespaldo,
  verificarFirma,
  type ParLlaves,
} from '../src/cripto/llaves';

const PASSWORD = 'una-contraseña-larga-123';
const HASH = 'ab'.repeat(32); // un hash_datos de ejemplo (64 hex)
const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const aB64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)));

let par: ParLlaves;
const obtenerPar = async (): Promise<ParLlaves> => (par ??= await generarPar());

describe('generar y firmar', () => {
  it('generar → firmar → verificar con la pública da true', async () => {
    const p = await obtenerPar();
    const firma = await firmarHashDatos(p.privada, HASH);
    expect(await verificarFirma(p.publica, HASH, firma)).toBe(true);
  });

  it('la firma es IEEE-P1363 de 64 bytes y falla si cambia el mensaje o la firma', async () => {
    const p = await obtenerPar();
    const firma = await firmarHashDatos(p.privada, HASH);
    expect(bytes(firma)).toHaveLength(64);
    expect(await verificarFirma(p.publica, 'cd'.repeat(32), firma)).toBe(false);
    const alterada = bytes(firma);
    alterada[0] = (alterada[0] as number) ^ 0xff;
    expect(await verificarFirma(p.publica, HASH, btoa(String.fromCharCode(...alterada)))).toBe(
      false,
    );
  });

  it('compatibilidad: la firma verifica con node:crypto (ieee-p1363) sobre la SPKI exportada', async () => {
    const p = await obtenerPar();
    const spki = await exportarPublicaSpkiB64(p.publica);
    const firma = await firmarHashDatos(p.privada, HASH);
    const mensaje = new TextEncoder().encode(HASH);
    const llave = {
      key: bytes(spki),
      format: 'der',
      type: 'spki',
      dsaEncoding: 'ieee-p1363',
    } as const;
    expect(verify('sha256', mensaje, llave, bytes(firma))).toBe(true);
    expect(verify('sha256', new TextEncoder().encode('cd'.repeat(32)), llave, bytes(firma))).toBe(
      false,
    );
  });

  it('la pública se exporta como SPKI DER P-256 en base64 (91 bytes)', async () => {
    const spki = await exportarPublicaSpkiB64((await obtenerPar()).publica);
    expect(bytes(spki)).toHaveLength(91);
    expect(spki.startsWith('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE')).toBe(true);
  });
});

describe('huella', () => {
  it('es un SHA-256 en hex, determinista y distinta entre llaves', async () => {
    const a = await exportarPublicaSpkiB64((await obtenerPar()).publica);
    const b = await exportarPublicaSpkiB64((await generarPar()).publica);
    expect(await huellaSpkiHex(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(await huellaSpkiHex(a)).toBe(await huellaSpkiHex(a));
    expect(await huellaSpkiHex(a)).not.toBe(await huellaSpkiHex(b));
  });
});

describe('respaldo cifrado', () => {
  it('respaldo → importar con la contraseña correcta: la llave firma y verifica con la pública original', async () => {
    const p = await obtenerPar();
    const respaldo = await crearRespaldo(p, PASSWORD);
    const importado = await importarRespaldo(respaldo, PASSWORD);
    const firma = await firmarHashDatos(importado.privada, HASH);
    expect(await verificarFirma(p.publica, HASH, firma)).toBe(true);
    expect(await exportarPublicaSpkiB64(importado.publica)).toBe(
      await exportarPublicaSpkiB64(p.publica),
    );
  }, 30_000);

  it('el JSON tiene el formato v1 y no contiene la privada en claro', async () => {
    const p = await obtenerPar();
    const respaldo = await crearRespaldo(p, PASSWORD);
    expect(Object.keys(respaldo).sort()).toEqual(['ct', 'iter', 'iv', 'kdf', 'salt', 'spki', 'v']);
    expect(respaldo).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iter: 600_000 });
    expect(bytes(respaldo.salt)).toHaveLength(16);
    expect(bytes(respaldo.iv)).toHaveLength(12);
    const texto = JSON.stringify(respaldo);
    const pkcs8 = aB64(await crypto.subtle.exportKey('pkcs8', p.privada));
    expect(texto).not.toContain(pkcs8);
    expect(texto).not.toContain('"d"');
    expect(texto).not.toContain(PASSWORD);
    expect(respaldo.spki).toBe(await exportarPublicaSpkiB64(p.publica));
  }, 30_000);

  it('una contraseña incorrecta da un ErrorRespaldo controlado', async () => {
    const respaldo = await crearRespaldo(await obtenerPar(), PASSWORD);
    const error = await importarRespaldo(respaldo, 'otra-contraseña-larga').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorRespaldo);
    expect((error as Error).message).toMatch(/contraseña/i);
  }, 30_000);

  it('rechaza contraseñas de menos de 12 caracteres al crear', async () => {
    const error = await crearRespaldo(await obtenerPar(), 'corta').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRespaldo);
    expect((error as Error).message).toMatch(/12 caracteres/);
  });

  it.each([
    ['iter alterado', (r: Record<string, unknown>) => ({ ...r, iter: 600_001 })],
    ['ct alterado', (r: Record<string, unknown>) => ({ ...r, ct: btoa('x'.repeat(48)) })],
    ['salt alterado', (r: Record<string, unknown>) => ({ ...r, salt: btoa('s'.repeat(16)) })],
  ])(
    'detecta un respaldo manipulado: %s',
    async (_n, manipular) => {
      const respaldo = await crearRespaldo(await obtenerPar(), PASSWORD);
      const error = await importarRespaldo(manipular({ ...respaldo }), PASSWORD).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ErrorRespaldo);
    },
    30_000,
  );

  it('detecta un spki que no corresponde a la privada', async () => {
    const respaldo = await crearRespaldo(await obtenerPar(), PASSWORD);
    const otra = await exportarPublicaSpkiB64((await generarPar()).publica);
    const error = await importarRespaldo({ ...respaldo, spki: otra }, PASSWORD).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorRespaldo);
  }, 30_000);

  it('rechaza rápido un iter fuera de rango (no cuelga el navegador)', async () => {
    const respaldo = await crearRespaldo(await obtenerPar(), PASSWORD);
    const inicio = Date.now();
    const error = await importarRespaldo({ ...respaldo, iter: 2_000_000_000 }, PASSWORD).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorRespaldo);
    expect(Date.now() - inicio).toBeLessThan(1000);
  }, 30_000);

  it.each([
    ['null', null],
    ['texto', 'hola'],
    ['objeto vacío', {}],
    [
      'versión desconocida',
      { v: 2, kdf: 'PBKDF2-SHA256', iter: 600_000, salt: '', iv: '', ct: '', spki: '' },
    ],
    ['kdf desconocido', { v: 1, kdf: 'otro', iter: 600_000, salt: '', iv: '', ct: '', spki: '' }],
    [
      'base64 inválido',
      { v: 1, kdf: 'PBKDF2-SHA256', iter: 600_000, salt: '!!', iv: '!!', ct: '!!', spki: '!!' },
    ],
  ])('un respaldo mal formado (%s) da ErrorRespaldo, no una excepción cruda', async (_n, valor) => {
    const error = await importarRespaldo(valor, PASSWORD).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRespaldo);
  });
});
