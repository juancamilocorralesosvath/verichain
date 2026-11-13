import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pemASpki, huellaSpkiHexDe } from '../src/cripto/pem';
import { verificarFirmaWeb } from '../src/cripto/verificador-firma.web';
import { verificarLocal } from '../src/verificacion-local';
import { renderizar, simularApi } from './ayudantes';
import alterada from '../../../tools/verificador/test/fixtures/cadena-alterada.json?raw';
import valida from '../../../tools/verificador/test/fixtures/cadena-valida.json?raw';

// Vite no sirve archivos .pem (lista de denegación por defecto): se leen con fs.
// `import.meta.url` dentro de `new URL(...)` lo reescribe Vite como asset (y deniega .pem).
const aqui = (import.meta as unknown as { dirname: string }).dirname;
const fixture = (n: string): string =>
  readFileSync(`${aqui}/../../../tools/verificador/test/fixtures/${n}`, 'utf8');
const otraLlave = fixture('otra-llave-public.pem');
const pemServidor = fixture('server-public.pem');

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VerificadorFirma WebCrypto', () => {
  it('acepta una firma P1363 hecha con WebCrypto y rechaza una alterada', async () => {
    const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', par.publicKey));
    const spkiB64 = btoa(String.fromCharCode(...spki));
    const mensaje = 'a'.repeat(64);
    const firma = new Uint8Array(
      await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        par.privateKey,
        new TextEncoder().encode(mensaje),
      ),
    );
    expect(firma.length).toBe(64);
    const firmaB64 = btoa(String.fromCharCode(...firma));
    expect(await verificarFirmaWeb(spkiB64, mensaje, firmaB64)).toBe(true);
    const mala = new Uint8Array(firma);
    mala[10] = (mala[10] ?? 0) ^ 1;
    expect(await verificarFirmaWeb(spkiB64, mensaje, btoa(String.fromCharCode(...mala)))).toBe(
      false,
    );
    expect(await verificarFirmaWeb(spkiB64, 'b'.repeat(64), firmaB64)).toBe(false);
  });

  it('entradas mal formadas dan false, no excepción', async () => {
    expect(await verificarFirmaWeb('no-es-base64!!', 'x', 'y')).toBe(false);
  });
});

describe('PEM', () => {
  it('convierte el PEM a SPKI y calcula la huella SHA-256', async () => {
    const spki = pemASpki(pemServidor);
    expect(spki).toMatch(/^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/);
    expect(await huellaSpkiHexDe(spki)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('un PEM inválido lanza un error claro', () => {
    expect(() => pemASpki('hola')).toThrow(/PEM/);
  });
});

describe('verificarLocal', () => {
  it('cadena válida con la llave correcta → íntegra y sin advertencia', async () => {
    const r = await verificarLocal(valida, pemServidor);
    expect(r.reporte.valida).toBe(true);
    expect(r.advertenciaHuella).toBeNull();
    expect(r.dificultad).toBe(2);
  });
  it('cadena alterada → comprometida y primer bloque roto 2', async () => {
    const r = await verificarLocal(alterada, pemServidor);
    expect(r.reporte.valida).toBe(false);
    expect(r.reporte.primerBloqueRoto).toBe(2);
  });
  it('PEM distinto → advertencia y sello en falla (siempre se usa la fijada)', async () => {
    const r = await verificarLocal(valida, otraLlave);
    expect(r.advertenciaHuella).not.toBeNull();
    expect(r.reporte.valida).toBe(false);
    expect(r.reporte.sello.estado).toBe('falla');
  });
  it('sin sello en el archivo → comprometida', async () => {
    const sinSello = JSON.parse(valida) as Record<string, unknown>;
    sinSello['sello'] = null;
    const r = await verificarLocal(JSON.stringify(sinSello), pemServidor);
    expect(r.reporte.valida).toBe(false);
    expect(r.reporte.sello.estado).toBe('falla');
  });
  it('JSON inválido o formato desconocido → error claro', async () => {
    await expect(verificarLocal('{no es json', pemServidor)).rejects.toThrow(/JSON/);
    await expect(verificarLocal('{"formato":"otro/9"}', pemServidor)).rejects.toThrow();
  });
  it('PEM inválido → error claro', async () => {
    await expect(verificarLocal(valida, 'basura')).rejects.toThrow(/PEM/);
  });
  it('no hace ningún fetch', async () => {
    const espia = vi.fn();
    vi.stubGlobal('fetch', espia);
    await verificarLocal(valida, pemServidor);
    expect(espia).not.toHaveBeenCalled();
  });
});

const archivo = (texto: string, nombre: string) => new File([texto], nombre);

describe('Página /verificador', () => {
  it('es pública y muestra el reporte con los dos archivos, sin fetch de verificación', async () => {
    const mock = simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const u = userEvent.setup();
    await u.upload(
      await screen.findByLabelText(/cadena\.json|archivo de la cadena/i),
      archivo(valida, 'cadena.json'),
    );
    await u.upload(
      screen.getByLabelText(/llave pública del servidor/i),
      archivo(pemServidor, 'server-public.pem'),
    );
    const antes = mock.mock.calls.length;
    await u.click(screen.getByRole('button', { name: /verificar localmente/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/íntegra/i);
    expect(mock.mock.calls.length).toBe(antes); // verificar no llamó a la red
    expect(screen.getByText(/dificultad/i).textContent).toMatch(/2/);
  });

  it('cadena alterada → comprometida y bloque 2', async () => {
    simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const u = userEvent.setup();
    await u.upload(
      await screen.findByLabelText(/archivo de la cadena/i),
      archivo(alterada, 'cadena.json'),
    );
    await u.upload(
      screen.getByLabelText(/llave pública del servidor/i),
      archivo(pemServidor, 's.pem'),
    );
    await u.click(screen.getByRole('button', { name: /verificar localmente/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/primer bloque roto: 2/i);
  });

  it('PEM distinto → advertencia visible', async () => {
    simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const u = userEvent.setup();
    await u.upload(
      await screen.findByLabelText(/archivo de la cadena/i),
      archivo(valida, 'cadena.json'),
    );
    await u.upload(
      screen.getByLabelText(/llave pública del servidor/i),
      archivo(otraLlave, 'otra.pem'),
    );
    await u.click(screen.getByRole('button', { name: /verificar localmente/i }));
    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText(/no coincide/i)).toBeTruthy();
  });

  it('archivo inválido → mensaje claro', async () => {
    simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const u = userEvent.setup();
    await u.upload(
      await screen.findByLabelText(/archivo de la cadena/i),
      archivo('esto no es json', 'cadena.json'),
    );
    await u.upload(
      screen.getByLabelText(/llave pública del servidor/i),
      archivo(pemServidor, 's.pem'),
    );
    await u.click(screen.getByRole('button', { name: /verificar localmente/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/json/i);
  });

  it('sin archivos el botón está deshabilitado', async () => {
    simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const boton = await screen.findByRole('button', { name: /verificar localmente/i });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});
