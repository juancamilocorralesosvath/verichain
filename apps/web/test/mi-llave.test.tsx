import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarPar } from '../src/cripto/almacen';
import { crearRespaldo, generarPar } from '../src/cripto/llaves';
import { renderizar, sesion, simularApi } from './ayudantes';

const PASSWORD = 'una-contraseña-larga-123';
const SPKI = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/;

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  simularApi({ ...sesion('registrador') });
  await borrarPar('registrador1');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const leerBlob = (blob: Blob): Promise<string> =>
  new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error('no se pudo leer el blob'));
    lector.readAsText(blob);
  });

describe('Mi llave', () => {
  it('sin llave ofrece generarla; al generar muestra la pública y quita el botón', async () => {
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Generar llave' }));
    expect(await screen.findByText(SPKI)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generar llave' })).toBeNull();
  });

  it('la llave persiste: al volver a abrir la página se carga desde IndexedDB', async () => {
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Generar llave' }));
    const spki = (await screen.findByText(SPKI)).textContent;
    cleanup();
    renderizar('/mi-llave');
    expect((await screen.findByText(SPKI)).textContent).toBe(spki);
    expect(screen.queryByRole('button', { name: 'Generar llave' })).toBeNull();
  });

  it('el respaldo con una contraseña corta muestra un error y no descarga nada', async () => {
    const crearUrl = vi.fn(() => 'blob:prueba');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: vi.fn() }),
    );
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Generar llave' }));
    await screen.findByText(SPKI);
    await usuario.type(screen.getByLabelText('Contraseña para el respaldo'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Descargar respaldo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/12 caracteres/);
    expect(crearUrl).not.toHaveBeenCalled();
  });

  it('descarga un respaldo JSON v1 sin la privada en claro', async () => {
    const crearUrl = vi.fn<(blob: Blob) => string>(() => 'blob:prueba');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: vi.fn() }),
    );
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Generar llave' }));
    await screen.findByText(SPKI);
    await usuario.type(screen.getByLabelText('Contraseña para el respaldo'), PASSWORD);
    await usuario.click(screen.getByRole('button', { name: 'Descargar respaldo' }));
    await waitFor(() => expect(crearUrl).toHaveBeenCalledTimes(1));
    const texto = await leerBlob(crearUrl.mock.calls[0]![0]);
    const json = JSON.parse(texto) as Record<string, unknown>;
    expect(json).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iter: 600_000 });
    expect(texto).not.toContain('"d"');
    expect(texto).not.toContain(PASSWORD);
  }, 30_000);

  it('importar con contraseña incorrecta muestra el error y la página sigue viva', async () => {
    const respaldo = await crearRespaldo(await generarPar(), PASSWORD);
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.upload(
      await screen.findByLabelText('Archivo de respaldo'),
      new File([JSON.stringify(respaldo)], 'respaldo.json', { type: 'application/json' }),
    );
    await usuario.type(
      screen.getByLabelText('Contraseña del respaldo importado'),
      'otra-contraseña-larga',
    );
    await usuario.click(screen.getByRole('button', { name: 'Importar respaldo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/contraseña/i);
    expect(screen.getByRole('heading', { name: 'Mi llave' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generar llave' })).toBeTruthy();
  }, 30_000);

  it('importar con la contraseña correcta deja la llave del respaldo', async () => {
    const par = await generarPar();
    const respaldo = await crearRespaldo(par, PASSWORD);
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.upload(
      await screen.findByLabelText('Archivo de respaldo'),
      new File([JSON.stringify(respaldo)], 'respaldo.json', { type: 'application/json' }),
    );
    await usuario.type(screen.getByLabelText('Contraseña del respaldo importado'), PASSWORD);
    await usuario.click(screen.getByRole('button', { name: 'Importar respaldo' }));
    expect((await screen.findByText(SPKI)).textContent).toBe(respaldo.spki);
  }, 30_000);

  it('si ya hay una llave, importar pide confirmación y respeta la cancelación', async () => {
    const respaldo = await crearRespaldo(await generarPar(), PASSWORD);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    renderizar('/mi-llave');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Generar llave' }));
    const original = (await screen.findByText(SPKI)).textContent;
    await usuario.upload(
      screen.getByLabelText('Archivo de respaldo'),
      new File([JSON.stringify(respaldo)], 'respaldo.json', { type: 'application/json' }),
    );
    await usuario.type(screen.getByLabelText('Contraseña del respaldo importado'), PASSWORD);
    await usuario.click(screen.getByRole('button', { name: 'Importar respaldo' }));
    await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
    expect(screen.getByText(SPKI).textContent).toBe(original);
  }, 30_000);
});
