import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarPar, guardarPar } from '../src/cripto/almacen';
import { exportarPublicaSpkiB64, generarPar, verificarFirma } from '../src/cripto/llaves';
import { llamadas, renderizar, sesion, simularApi } from './ayudantes';

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await borrarPar('registrador1');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fila = {
  id: 1,
  cedula: '1234567',
  nombre: 'Ana Pérez',
  direccion: 'Calle 1 # 2-3',
  telefono: '3001234567',
  creado_en: '2026-11-09T12:30:45.123Z',
  creado_por: 'registrador1',
  integra: true,
};
const HASH = 'ab'.repeat(32);
const validos = {
  cedula: '7654321',
  nombre: 'Luis Gómez',
  direccion: 'Carrera 5 # 6-7',
  telefono: '3105551234',
};

/** Deja en IndexedDB la llave local del registrador y devuelve lo que diría /api/llaves/mias. */
async function llaveLocal(estado: string | null) {
  const par = await generarPar();
  await guardarPar('registrador1', par);
  const spki = await exportarPublicaSpkiB64(par.publica);
  const mias =
    estado === null
      ? []
      : [
          {
            id: 7,
            version: 1,
            estado,
            spki_b64: spki,
            creado_en: fila.creado_en,
            aprobada_en: null,
          },
        ];
  return { par, mias };
}

async function llenar(usuario: ReturnType<typeof userEvent.setup>, v: Record<string, string>) {
  await usuario.type(await screen.findByLabelText('Cédula'), v['cedula'] ?? '');
  await usuario.type(screen.getByLabelText('Nombre'), v['nombre'] ?? '');
  await usuario.type(screen.getByLabelText('Dirección'), v['direccion'] ?? '');
  await usuario.type(screen.getByLabelText('Teléfono'), v['telefono'] ?? '');
}

describe('Personas: tabla', () => {
  it('el registrador ve los datos reales (contrato de H4.2)', async () => {
    simularApi({ ...sesion('registrador'), 'GET /api/personas': { cuerpo: [fila] } });
    renderizar('/personas');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Ana Pérez')).toBeTruthy();
    expect(within(tabla).getByText('3001234567')).toBeTruthy();
    expect(within(tabla).getByText('Calle 1 # 2-3')).toBeTruthy();
  });

  it('muestra *** si la API aún devuelve la forma cruda (antes de H4.2)', async () => {
    const cruda = {
      id: 1,
      cedula: '1234567',
      nombre: 'Ana Pérez',
      direccion_cifrada: 'abc',
      telefono_cifrado: 'def',
      creado_en: fila.creado_en,
      creado_por: 'x',
    };
    simularApi({ ...sesion('registrador'), 'GET /api/personas': { cuerpo: [cruda] } });
    renderizar('/personas');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('***')).toHaveLength(2);
    expect(within(tabla).queryByText('abc')).toBeNull();
  });

  it('el auditor ve *** aunque el servidor envíe los datos, y no ve el formulario', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/personas': { cuerpo: [fila] } });
    renderizar('/personas');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('***')).toHaveLength(2);
    expect(within(tabla).queryByText('3001234567')).toBeNull();
    expect(within(tabla).queryByText('Calle 1 # 2-3')).toBeNull();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
  });

  it('marca las filas con integra: false', async () => {
    simularApi({
      ...sesion('registrador'),
      'GET /api/personas': {
        cuerpo: [
          fila,
          { ...fila, id: 2, cedula: '7654321', nombre: 'Luis', telefono: null, integra: false },
        ],
      },
    });
    renderizar('/personas');
    const tabla = await screen.findByRole('table');
    const corrupta = within(tabla).getByText('Luis').closest('tr') as HTMLElement;
    expect(corrupta.getAttribute('data-integra')).toBe('false');
    expect(within(corrupta).getByText(/dato corrupto/i)).toBeTruthy();
    const sana = within(tabla).getByText('Ana Pérez').closest('tr') as HTMLElement;
    expect(sana.getAttribute('data-integra')).toBe('true');
  });
});

describe('Personas: estados', () => {
  it('cargando', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/personas': () => new Promise(() => undefined) });
    renderizar('/personas');
    expect(await screen.findByText(/cargando personas/i)).toBeTruthy();
  });
  it('error: muestra el mensaje de la API', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/personas': {
        status: 500,
        cuerpo: { statusCode: 500, mensaje: 'Error interno del servidor' },
      },
    });
    renderizar('/personas');
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno del servidor/i);
  });
  it('vacío', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/personas': { cuerpo: [] } });
    renderizar('/personas');
    expect(await screen.findByText(/no hay personas registradas/i)).toBeTruthy();
  });
});

describe('Personas: llave requerida para crear', () => {
  it('sin llave local explica y enlaza a Mi llave (sin formulario)', async () => {
    simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'GET /api/llaves/mias': { cuerpo: [] },
    });
    renderizar('/personas');
    const aviso = await screen.findByRole('region', { name: 'Llave requerida' });
    expect(within(aviso).getByText(/no tienes una llave en este navegador/i)).toBeTruthy();
    expect(within(aviso).getByRole('link', { name: 'Ir a Mi llave' })).toBeTruthy();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
  });

  it('llave local sin registrar en el servidor', async () => {
    await llaveLocal(null);
    simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'GET /api/llaves/mias': { cuerpo: [] },
    });
    renderizar('/personas');
    const aviso = await screen.findByRole('region', { name: 'Llave requerida' });
    expect(within(aviso).getByText(/no está registrada en el servidor/i)).toBeTruthy();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
  });

  it('llave pendiente de aprobación', async () => {
    const { mias } = await llaveLocal('pendiente');
    simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'GET /api/llaves/mias': { cuerpo: mias },
    });
    renderizar('/personas');
    const aviso = await screen.findByRole('region', { name: 'Llave requerida' });
    expect(within(aviso).getByText(/pendiente de aprobación/i)).toBeTruthy();
    expect(screen.queryByLabelText('Cédula')).toBeNull();
  });
});

describe('Personas: formulario firmado (preparar → firmar → confirmar)', () => {
  async function montar(extra: Record<string, unknown> = {}) {
    const { par, mias } = await llaveLocal('aprobada');
    const mock = simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'GET /api/llaves/mias': { cuerpo: mias },
      'POST /api/bloques/preparar': {
        status: 201,
        cuerpo: { borrador_id: 'b-1', hash_datos: HASH },
      },
      'POST /api/bloques/confirmar': { status: 201, cuerpo: { indice: 1 } },
      ...extra,
    });
    renderizar('/personas');
    return { par, mock };
  }
  const cuerpoDe = (mock: ReturnType<typeof simularApi>, ruta: string): Record<string, unknown> => {
    const [, opciones] = llamadas(mock, 'POST', ruta)[0] as [string, RequestInit];
    return JSON.parse(opciones.body as string) as Record<string, unknown>;
  };

  it('con una cédula inválida muestra el error y no pide preparar nada', async () => {
    const { mock } = await montar();
    const usuario = userEvent.setup();
    await llenar(usuario, { ...validos, cedula: 'abc' });
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText(/la cédula debe tener/i)).toBeTruthy();
    expect(llamadas(mock, 'POST', '/api/bloques/preparar')).toHaveLength(0);
  });

  it('prepara, firma con la llave local y confirma con una firma que verifica', async () => {
    const { par, mock } = await montar();
    const usuario = userEvent.setup();
    await llenar(usuario, { ...validos, nombre: '  Luis Gómez ' });
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    await waitFor(() => expect(llamadas(mock, 'POST', '/api/bloques/confirmar')).toHaveLength(1));

    expect(cuerpoDe(mock, '/api/bloques/preparar')).toEqual(validos);
    const confirmar = cuerpoDe(mock, '/api/bloques/confirmar');
    expect(Object.keys(confirmar).sort()).toEqual(['borrador_id', 'firma_b64', 'llave_id']);
    expect(confirmar).toMatchObject({ borrador_id: 'b-1', llave_id: 7 });
    expect(await verificarFirma(par.publica, HASH, confirmar['firma_b64'] as string)).toBe(true);
    // recarga la tabla después de confirmar
    await waitFor(() =>
      expect(llamadas(mock, 'GET', '/api/personas').length).toBeGreaterThanOrEqual(2),
    );
  });

  it('muestra el mensaje del servidor si preparar da 409 y no confirma', async () => {
    const { mock } = await montar({
      'POST /api/bloques/preparar': {
        status: 409,
        cuerpo: { statusCode: 409, mensaje: 'Registro duplicado' },
      },
    });
    const usuario = userEvent.setup();
    await llenar(usuario, validos);
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText('Registro duplicado')).toBeTruthy();
    expect(llamadas(mock, 'POST', '/api/bloques/confirmar')).toHaveLength(0);
  });

  it('muestra "Minando…" mientras confirma y después el nonce, los intentos y el tiempo', async () => {
    let terminar: (() => void) | undefined;
    await montar({
      'POST /api/bloques/confirmar': () =>
        new Promise((resolver) => {
          terminar = () =>
            resolver({
              status: 201,
              cuerpo: { indice: 5, nonce: 4242, intentos: 4243, ms: 87 },
            });
        }),
    });
    const usuario = userEvent.setup();
    await llenar(usuario, validos);
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/minando/i);
    await waitFor(() => expect(terminar).toBeDefined());
    terminar?.();
    const resumen = await screen.findByText(/bloque 5 anexado/i);
    expect(resumen.textContent).toMatch(/nonce 4242/i);
    expect(resumen.textContent).toMatch(/4243 intentos/i);
    expect(resumen.textContent).toMatch(/87 ms/i);
    expect(screen.queryByText(/minando/i)).toBeNull();
  });

  it('si la respuesta no trae datos de minado, igual confirma el anexo', async () => {
    await montar();
    const usuario = userEvent.setup();
    await llenar(usuario, validos);
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText(/bloque 1 anexado/i)).toBeTruthy();
  });

  it.each([
    [410, 'El borrador expiró'],
    [400, 'Firma inválida'],
    [403, 'Llave no autorizada'],
  ])('muestra el error %s de confirmar', async (status, mensaje) => {
    await montar({
      'POST /api/bloques/confirmar': { status, cuerpo: { statusCode: status, mensaje } },
    });
    const usuario = userEvent.setup();
    await llenar(usuario, validos);
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText(mensaje)).toBeTruthy();
  });
});
