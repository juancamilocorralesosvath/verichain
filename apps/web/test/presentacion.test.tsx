import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderizar, sesion, simularApi } from './ayudantes';

const CLAVE = 'verichain:presentacion';
const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute('data-presentacion');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  html().removeAttribute('data-presentacion');
});

const catalogo = [
  {
    id: 'modificar-dato',
    nombre: 'Modificar un dato',
    descripcion: 'Cambia un nombre.',
    deteccionEsperada: 'Falla hash_datos del bloque',
  },
  {
    id: 'truncar',
    nombre: 'Truncar la cadena',
    descripcion: 'Borra el último bloque.',
    deteccionEsperada: 'Falla el sello del servidor',
  },
];

describe('Modo presentación', () => {
  it('hay un interruptor accesible, apagado por defecto, también sin sesión', async () => {
    simularApi({
      'GET /api/auth/yo': { status: 401, cuerpo: { statusCode: 401, mensaje: 'No autorizado' } },
    });
    renderizar('/verificador');
    const boton = await screen.findByRole('button', { name: /modo presentación/i });
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(html().getAttribute('data-presentacion')).toBeNull();
  });

  it('al activarlo marca <html data-presentacion> y lo recuerda; al desactivarlo lo quita', async () => {
    simularApi({ ...sesion('auditor'), 'GET /api/cadena': { cuerpo: [] } });
    renderizar('/cadena');
    const u = userEvent.setup();
    const boton = await screen.findByRole('button', { name: /modo presentación/i });
    await u.click(boton);
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(html().getAttribute('data-presentacion')).toBe('true');
    expect(localStorage.getItem(CLAVE)).toBe('1');
    await u.click(boton);
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(html().getAttribute('data-presentacion')).toBeNull();
    expect(localStorage.getItem(CLAVE)).toBe('0');
  });

  it('arranca activado si se dejó activado antes', async () => {
    localStorage.setItem(CLAVE, '1');
    simularApi({ ...sesion('auditor'), 'GET /api/cadena': { cuerpo: [] } });
    renderizar('/cadena');
    const boton = await screen.findByRole('button', { name: /modo presentación/i });
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(html().getAttribute('data-presentacion')).toBe('true');
  });

  it('si el almacenamiento falla, igual funciona (solo no se recuerda)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    simularApi({ ...sesion('auditor'), 'GET /api/cadena': { cuerpo: [] } });
    renderizar('/cadena');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /modo presentación/i }));
    expect(html().getAttribute('data-presentacion')).toBe('true');
  });

  it('Ataques: la tarjeta "Qué se espera detectar" solo aparece en modo presentación', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/ataques': { cuerpo: catalogo } });
    renderizar('/ataques');
    const u = userEvent.setup();
    await screen.findByText('Modificar un dato');
    expect(screen.queryByRole('region', { name: /qué se espera detectar/i })).toBeNull();
    await u.click(screen.getByRole('button', { name: /modo presentación/i }));
    const tarjetas = screen.getAllByRole('region', { name: /qué se espera detectar/i });
    expect(tarjetas).toHaveLength(2);
    expect(within(tarjetas[0]!).getByText(/falla hash_datos del bloque/i)).toBeTruthy();
    expect(within(tarjetas[1]!).getByText(/falla el sello del servidor/i)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /modo presentación/i }));
    expect(screen.queryByRole('region', { name: /qué se espera detectar/i })).toBeNull();
  });
});
