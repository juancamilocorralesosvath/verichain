import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { llamadas, renderizar, sesion, simularApi } from './ayudantes';

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

async function llenar(usuario: ReturnType<typeof userEvent.setup>, v: Record<string, string>) {
  await usuario.type(await screen.findByLabelText('Cédula'), v['cedula'] ?? '');
  await usuario.type(screen.getByLabelText('Nombre'), v['nombre'] ?? '');
  await usuario.type(screen.getByLabelText('Dirección'), v['direccion'] ?? '');
  await usuario.type(screen.getByLabelText('Teléfono'), v['telefono'] ?? '');
}
const validos = {
  cedula: '7654321',
  nombre: 'Luis Gómez',
  direccion: 'Carrera 5 # 6-7',
  telefono: '3105551234',
};

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

describe('Personas: formulario', () => {
  it('con una cédula inválida muestra el error y no envía la petición', async () => {
    const mock = simularApi({ ...sesion('registrador'), 'GET /api/personas': { cuerpo: [] } });
    renderizar('/personas');
    const usuario = userEvent.setup();
    await llenar(usuario, { ...validos, cedula: 'abc' });
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText(/la cédula debe tener/i)).toBeTruthy();
    expect(llamadas(mock, 'POST', '/api/personas')).toHaveLength(0);
  });

  it('con datos válidos envía el POST normalizado y recarga la lista', async () => {
    const mock = simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'POST /api/personas': { status: 201, cuerpo: { id: 9 } },
    });
    renderizar('/personas');
    const usuario = userEvent.setup();
    await llenar(usuario, { ...validos, nombre: '  Luis Gómez ' });
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    await waitFor(() => expect(llamadas(mock, 'POST', '/api/personas')).toHaveLength(1));
    const [, opciones] = llamadas(mock, 'POST', '/api/personas')[0] as [string, RequestInit];
    expect(JSON.parse(opciones.body as string)).toEqual(validos);
    await waitFor(() =>
      expect(llamadas(mock, 'GET', '/api/personas').length).toBeGreaterThanOrEqual(2),
    );
  });

  it('muestra el mensaje del servidor si responde 409', async () => {
    simularApi({
      ...sesion('registrador'),
      'GET /api/personas': { cuerpo: [] },
      'POST /api/personas': {
        status: 409,
        cuerpo: { statusCode: 409, mensaje: 'Registro duplicado' },
      },
    });
    renderizar('/personas');
    const usuario = userEvent.setup();
    await llenar(usuario, validos);
    await usuario.click(screen.getByRole('button', { name: 'Crear persona' }));
    expect(await screen.findByText('Registro duplicado')).toBeTruthy();
  });
});
