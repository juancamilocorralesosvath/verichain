import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { llamadas, renderizar, sesion, simularApi } from './ayudantes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const h = (c: string): string => c.repeat(64);
const bloques = [
  {
    indice: 1,
    persona_id: 1,
    hash_datos: h('b'),
    nonce: 77,
    hash_anterior: h('0'),
    hash_cadena: h('c'),
    firma_usuario: null,
    llave_id: 4,
    creado_en: '2026-11-09T12:31:00.000Z',
  },
  {
    indice: 0,
    persona_id: null,
    hash_datos: h('a'),
    nonce: 12,
    hash_anterior: h('0'),
    hash_cadena: h('0') + '',
    firma_usuario: null,
    llave_id: null,
    creado_en: '2026-11-09T12:30:00.000Z',
  },
];
const personas = [{ id: 1, cedula: '1234567', nombre: 'Ana', creado_por: 'registrador1' }];

describe('Cadena', () => {
  it('lista los bloques en orden de índice y distingue el génesis', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    const tabla = await screen.findByRole('table');
    const filas = within(tabla).getAllByRole('row').slice(1); // sin el encabezado
    expect(filas).toHaveLength(2);
    expect(within(filas[0] as HTMLElement).getByText('Génesis')).toBeTruthy();
    expect((filas[0] as HTMLElement).className).toMatch(/genesis/);
    expect(within(filas[1] as HTMLElement).queryByText('Génesis')).toBeNull();
  });

  it('abrevia los hashes y deja el completo en el tooltip', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    const tabla = await screen.findByRole('table');
    const completo = tabla.querySelector(`[title="${h('c')}"]`) as HTMLElement;
    expect(completo).toBeTruthy();
    expect(completo.textContent).toBe('cccccccc…cccc');
  });

  it('muestra nonce, llave_id y el firmante unido desde personas', async () => {
    simularApi({
      ...sesion('registrador'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    const tabla = await screen.findByRole('table');
    const fila = within(tabla).getAllByRole('row')[2] as HTMLElement; // bloque 1
    expect(within(fila).getByText('77')).toBeTruthy();
    expect(within(fila).getByText('4')).toBeTruthy();
    expect(await within(fila).findByText('registrador1')).toBeTruthy();
  });

  it('el admin no puede leer personas: no las pide y el firmante sale —', async () => {
    const mock = simularApi({ ...sesion('admin'), 'GET /api/cadena': { cuerpo: bloques } });
    renderizar('/cadena');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('—').length).toBeGreaterThan(0);
    expect(llamadas(mock, 'GET', '/api/personas')).toHaveLength(0);
  });

  it('cargando', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/cadena': () => new Promise(() => undefined) });
    renderizar('/cadena');
    expect(await screen.findByText(/cargando la cadena/i)).toBeTruthy();
  });
  it('error: muestra el mensaje de la API', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': {
        status: 500,
        cuerpo: { statusCode: 500, mensaje: 'Error interno del servidor' },
      },
    });
    renderizar('/cadena');
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno del servidor/i);
  });
  it('vacío', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: [] },
      'GET /api/personas': { cuerpo: [] },
    });
    renderizar('/cadena');
    expect(await screen.findByText(/no hay bloques/i)).toBeTruthy();
  });
});
