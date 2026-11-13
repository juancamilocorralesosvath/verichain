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

describe('Personas: carga masiva CSV (H7.1)', () => {
  const H1 = 'a1'.repeat(32);
  const H2 = 'b2'.repeat(32);
  const lote = {
    validas: [
      { fila: 2, borrador_id: 'bor-1', hash_datos: H1 },
      { fila: 3, borrador_id: 'bor-2', hash_datos: H2 },
    ],
    invalidas: [{ fila: 4, errores: ['cedula debe tener entre 6 y 10 dígitos'] }],
  };
  const csv = (nombre = 'personas.csv', tipo = 'text/csv', contenido = 'cedula,nombre\n') =>
    new File([contenido], nombre, { type: tipo });

  async function montar(extra: Record<string, unknown> = {}, estado: string | null = 'aprobada') {
    const { par, mias } = await llaveLocal(estado);
    const mock = simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'GET /api/llaves/mias': { cuerpo: mias },
      'POST /api/bloques/preparar-lote': { status: 201, cuerpo: lote },
      'POST /api/bloques/confirmar-lote': {
        status: 201,
        cuerpo: { anexadas: [1, 2], error: null },
      },
      ...extra,
    });
    renderizar('/personas');
    return { par, mock };
  }
  const subir = async (usuario: ReturnType<typeof userEvent.setup>, archivo = csv()) => {
    await usuario.upload(await screen.findByLabelText(/archivo csv/i), archivo);
    await usuario.click(screen.getByRole('button', { name: /subir y validar/i }));
  };

  it('el registrador sin llave aprobada no ve la carga masiva', async () => {
    await montar({}, 'pendiente');
    await screen.findByText(/pendiente de aprobación/i);
    expect(screen.queryByLabelText(/archivo csv/i)).toBeNull();
  });

  it('el auditor no ve la carga masiva', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/personas': { cuerpo: [] } });
    renderizar('/personas');
    await screen.findByText(/no hay personas/i);
    expect(screen.queryByLabelText(/archivo csv/i)).toBeNull();
  });

  it('sube el CSV como multipart y muestra válidas e inválidas con sus errores', async () => {
    const { mock } = await montar();
    const usuario = userEvent.setup();
    await subir(usuario);
    expect(await screen.findByText(/2 válidas y 1 inválida/i)).toBeTruthy();
    const alertaFila = screen.getByRole('row', { name: /4.*cedula debe tener/i });
    expect(alertaFila).toBeTruthy();
    const [, opciones] = llamadas(mock, 'POST', '/api/bloques/preparar-lote')[0] as [
      string,
      RequestInit,
    ];
    expect(opciones.body).toBeInstanceOf(FormData);
    expect((opciones.body as FormData).get('archivo')).toBeInstanceOf(File);
    // con FormData no se fuerza application/json
    expect(JSON.stringify(opciones.headers ?? {})).not.toMatch(/application\/json/);
  });

  it('"Firmar y anexar 2" firma todos los hash_datos con la llave local y confirma en orden', async () => {
    const { par, mock } = await montar();
    const usuario = userEvent.setup();
    await subir(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Firmar y anexar 2' }));
    expect(await screen.findByText(/se anexaron 2 de 2/i)).toBeTruthy();
    const [, opciones] = llamadas(mock, 'POST', '/api/bloques/confirmar-lote')[0] as [
      string,
      RequestInit,
    ];
    const { items } = JSON.parse(opciones.body as string) as {
      items: { borrador_id: string; llave_id: number; firma_b64: string }[];
    };
    expect(items.map((i) => i.borrador_id)).toEqual(['bor-1', 'bor-2']);
    expect(items.every((i) => i.llave_id === 7)).toBe(true);
    expect(await verificarFirma(par.publica, H1, items[0]!.firma_b64)).toBe(true);
    expect(await verificarFirma(par.publica, H2, items[1]!.firma_b64)).toBe(true);
    // recarga la tabla y limpia el lote
    await waitFor(() =>
      expect(llamadas(mock, 'GET', '/api/personas').length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.queryByRole('button', { name: /firmar y anexar/i })).toBeNull();
  });

  it('falla a mitad de lote: informa cuántas quedaron anexadas y el motivo', async () => {
    await montar({
      'POST /api/bloques/confirmar-lote': {
        status: 201,
        cuerpo: { anexadas: [1], error: 'Firma inválida' },
      },
    });
    const usuario = userEvent.setup();
    await subir(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Firmar y anexar 2' }));
    const alerta = await screen.findByText(/se anexaron 1 de 2/i);
    expect(alerta.textContent).toMatch(/firma inválida/i);
  });

  it('un CSV sin filas válidas no ofrece firmar', async () => {
    await montar({
      'POST /api/bloques/preparar-lote': {
        status: 201,
        cuerpo: { validas: [], invalidas: lote.invalidas },
      },
    });
    const usuario = userEvent.setup();
    await subir(usuario);
    expect(await screen.findByText(/0 válidas y 1 inválida/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /firmar y anexar/i })).toBeNull();
  });

  it('muestra el error del servidor (p. ej. encabezado incorrecto)', async () => {
    await montar({
      'POST /api/bloques/preparar-lote': {
        status: 400,
        cuerpo: { statusCode: 400, mensaje: 'CSV inválido' },
      },
    });
    const usuario = userEvent.setup();
    await subir(usuario);
    expect((await screen.findByText('CSV inválido')).getAttribute('role')).toBe('alert');
  });

  it('rechaza en el navegador un archivo de más de 200 KB sin llamar al servidor', async () => {
    const { mock } = await montar();
    const usuario = userEvent.setup();
    await subir(usuario, csv('grande.csv', 'text/csv', 'a'.repeat(201 * 1024)));
    expect((await screen.findByRole('alert')).textContent).toMatch(/200 KB/);
    expect(llamadas(mock, 'POST', '/api/bloques/preparar-lote')).toHaveLength(0);
  });
});
