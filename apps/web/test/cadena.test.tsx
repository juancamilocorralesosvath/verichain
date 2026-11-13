import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const bloqueEn = (indice: number): HTMLElement =>
  document.querySelector(`[data-bloque="${indice}"]`) as HTMLElement;

describe('Cadena', () => {
  it('muestra los bloques como lista ordenada por índice y distingue el génesis', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    const lista = await screen.findByRole('list', { name: /bloques de la cadena/i });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(bloqueEn(0)).getByText('Génesis')).toBeTruthy();
    expect(bloqueEn(0).getAttribute('data-genesis')).toBe('true');
    expect(within(bloqueEn(1)).queryByText('Génesis')).toBeNull();
    // el génesis va primero
    expect(items[0]?.contains(bloqueEn(0))).toBe(true);
  });

  it('une cada bloque con el anterior mediante una conexión', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    await screen.findByRole('list', { name: /bloques de la cadena/i });
    expect(document.querySelectorAll('[data-conexion]')).toHaveLength(1);
    expect(document.querySelector('[data-conexion="1"]')).toBeTruthy();
  });

  it('abrevia los hashes y deja el completo en el tooltip', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: bloques },
      'GET /api/personas': { cuerpo: personas },
    });
    renderizar('/cadena');
    const lista = await screen.findByRole('list', { name: /bloques de la cadena/i });
    const completo = lista.querySelector(`[title="${h('c')}"]`) as HTMLElement;
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
    await screen.findByRole('list', { name: /bloques de la cadena/i });
    const bloque = bloqueEn(1);
    expect(within(bloque).getByText('77')).toBeTruthy();
    expect(within(bloque).getByText('4')).toBeTruthy();
    expect(await within(bloque).findByText('registrador1')).toBeTruthy();
  });

  it('el admin no puede leer personas: no las pide y el firmante sale —', async () => {
    const mock = simularApi({ ...sesion('admin'), 'GET /api/cadena': { cuerpo: bloques } });
    renderizar('/cadena');
    const lista = await screen.findByRole('list', { name: /bloques de la cadena/i });
    expect(within(lista).getAllByText('—').length).toBeGreaterThan(0);
    expect(llamadas(mock, 'GET', '/api/personas')).toHaveLength(0);
  });

  it('con 30 bloques sigue en una lista con desplazamiento propio', async () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({
      ...bloques[0]!,
      indice: i,
      persona_id: i === 0 ? null : i,
      llave_id: i === 0 ? null : 4,
    }));
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: muchos },
      'GET /api/personas': { cuerpo: [] },
    });
    renderizar('/cadena');
    const lista = await screen.findByRole('list', { name: /bloques de la cadena/i });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(30);
    expect(document.querySelectorAll('[data-conexion]')).toHaveLength(29);
    const region = screen.getByRole('region', { name: /recorrido de la cadena/i });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.contains(lista)).toBe(true);
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

describe('Cadena: estado tras verificar', () => {
  const tres = [0, 1, 2].map((i) => ({
    ...bloques[0]!,
    indice: i,
    persona_id: i === 0 ? null : i,
    llave_id: i === 0 ? null : 4,
    hash_cadena: h(String(i + 1)),
  }));
  const chequeos = (falla: boolean) => ({
    hashDatos: falla ? 'falla' : 'ok',
    enlace: 'ok',
    hashCadena: falla ? 'falla' : 'ok',
    pow: 'ok',
    firmaUsuario: 'ok',
  });
  const reporte = (rotoEn: number | null, enlaceRoto = false, sello = 'ok') => ({
    valida: rotoEn === null && sello === 'ok',
    primerBloqueRoto: rotoEn,
    totalBloques: 3,
    sello: { estado: sello, motivos: sello === 'ok' ? [] : ['El sello no coincide.'] },
    bloques: [0, 1, 2].map((i) => ({
      indice: i,
      motivos: [],
      chequeos: {
        ...chequeos(i === rotoEn),
        ...(i === rotoEn && enlaceRoto ? { enlace: 'falla' } : {}),
      },
    })),
  });
  const montar = (rol: string, rep: unknown) =>
    simularApi({
      ...sesion(rol),
      'GET /api/cadena': { cuerpo: tres },
      'GET /api/personas': { cuerpo: [] },
      'GET /api/cadena/verificar': { cuerpo: rep },
    });

  it('antes de verificar los bloques no tienen estado', async () => {
    montar('auditor', reporte(null));
    renderizar('/cadena');
    await screen.findByRole('list', { name: /bloques de la cadena/i });
    expect(bloqueEn(1).getAttribute('data-estado')).toBe('sin-verificar');
  });

  it('el registrador no ve el botón de verificar', async () => {
    montar('registrador', reporte(null));
    renderizar('/cadena');
    await screen.findByRole('list', { name: /bloques de la cadena/i });
    expect(screen.queryByRole('button', { name: /verificar cadena/i })).toBeNull();
  });

  it('cadena íntegra: todos los bloques en ok y sin conexiones rotas', async () => {
    montar('auditor', reporte(null));
    renderizar('/cadena');
    await userEvent.click(await screen.findByRole('button', { name: /verificar cadena/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/íntegra/i);
    for (const i of [0, 1, 2]) expect(bloqueEn(i).getAttribute('data-estado')).toBe('ok');
    expect(document.querySelectorAll('[data-roto="true"]')).toHaveLength(0);
  });

  it('bloque roto: ese bloque en falla, los demás en ok', async () => {
    montar('admin', reporte(1));
    renderizar('/cadena');
    await userEvent.click(await screen.findByRole('button', { name: /verificar cadena/i }));
    await screen.findByText(/comprometida/i);
    expect(bloqueEn(0).getAttribute('data-estado')).toBe('ok');
    expect(bloqueEn(1).getAttribute('data-estado')).toBe('falla');
    expect(bloqueEn(2).getAttribute('data-estado')).toBe('ok');
    // el enlace con el anterior estaba bien: la conexión no se marca rota...
    expect(document.querySelector('[data-conexion="1"]')?.getAttribute('data-roto')).toBeNull();
    // ...pero las conexiones que tocan al bloque en falla quedan señaladas
    expect(document.querySelector('[data-conexion="1"]')?.getAttribute('data-afectada')).toBe(
      'true',
    );
    expect(document.querySelector('[data-conexion="2"]')?.getAttribute('data-afectada')).toBe(
      'true',
    );
  });

  it('enlace roto: la conexión hacia ese bloque se resalta', async () => {
    montar('auditor', reporte(2, true));
    renderizar('/cadena');
    await userEvent.click(await screen.findByRole('button', { name: /verificar cadena/i }));
    await screen.findByText(/comprometida/i);
    expect(document.querySelector('[data-conexion="2"]')?.getAttribute('data-roto')).toBe('true');
    expect(document.querySelector('[data-conexion="1"]')?.getAttribute('data-roto')).toBeNull();
  });

  it('sello en falla con bloques ok (truncamiento): lo avisa aunque ningún bloque falle', async () => {
    montar('auditor', reporte(null, false, 'falla'));
    renderizar('/cadena');
    await userEvent.click(await screen.findByRole('button', { name: /verificar cadena/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/sello/i);
    for (const i of [0, 1, 2]) expect(bloqueEn(i).getAttribute('data-estado')).toBe('ok');
  });

  it('error al verificar: muestra el mensaje', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena': { cuerpo: tres },
      'GET /api/personas': { cuerpo: [] },
      'GET /api/cadena/verificar': {
        status: 500,
        cuerpo: { statusCode: 500, mensaje: 'Error interno del servidor' },
      },
    });
    renderizar('/cadena');
    await userEvent.click(await screen.findByRole('button', { name: /verificar cadena/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
  });
});
