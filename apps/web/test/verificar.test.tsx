import type { ReporteBloque, ReporteCadena } from '@bc/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReporteVerificacion } from '../src/componentes/ReporteVerificacion';
import { llamadas, renderizar, sesion, simularApi } from './ayudantes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const okBloque = (indice: number): ReporteBloque => ({
  indice,
  chequeos: {
    hashDatos: 'ok',
    enlace: 'ok',
    hashCadena: 'ok',
    pow: 'ok',
    firmaUsuario: indice === 0 ? 'no-aplica' : 'ok',
  },
  motivos: [],
});

const integro: ReporteCadena = {
  valida: true,
  primerBloqueRoto: null,
  bloques: [okBloque(0), okBloque(1), okBloque(2)],
  sello: { estado: 'ok', motivos: [] },
  totalBloques: 3,
};

const roto: ReporteCadena = {
  valida: false,
  primerBloqueRoto: 1,
  bloques: [
    okBloque(0),
    {
      indice: 1,
      chequeos: {
        hashDatos: 'falla',
        enlace: 'ok',
        hashCadena: 'falla',
        pow: 'ok',
        firmaUsuario: 'falla',
      },
      motivos: ['El hash de los datos no coincide con el guardado.'],
    },
    okBloque(2),
  ],
  sello: { estado: 'falla', motivos: ['El sello no cubre el último bloque.'] },
  totalBloques: 3,
};

const truncada: ReporteCadena = {
  valida: false,
  primerBloqueRoto: null,
  bloques: [okBloque(0), okBloque(1)],
  sello: { estado: 'falla', motivos: ['El sello apunta a un bloque que ya no existe.'] },
  totalBloques: 2,
};

describe('<ReporteVerificacion>', () => {
  it('reporte íntegro: veredicto ✅ y sin bloque roto', () => {
    render(<ReporteVerificacion reporte={integro} />);
    expect(screen.getByRole('status').textContent).toMatch(/íntegra/i);
    expect(screen.getByRole('status').textContent).toContain('✅');
    expect(screen.queryByText(/primer bloque roto/i)).toBeNull();
    expect(document.querySelectorAll('[data-roto="true"]')).toHaveLength(0);
  });

  it('un chequeo no-aplica no se muestra como falla', () => {
    render(<ReporteVerificacion reporte={integro} />);
    const genesis = document.querySelector('[data-bloque="0"]') as HTMLElement;
    expect(within(genesis).getByText(/no aplica/i)).toBeTruthy();
    expect(within(genesis).queryByText(/falla/i)).toBeNull();
  });

  it('reporte con bloque roto: ❌, primer bloque, motivos y resaltado', () => {
    render(<ReporteVerificacion reporte={roto} />);
    expect(screen.getByRole('status').textContent).toContain('❌');
    expect(screen.getByRole('status').textContent).toMatch(/comprometida/i);
    expect(screen.getByRole('status').textContent).toMatch(/primer bloque roto: 1/i);
    const bloque = document.querySelector('[data-bloque="1"]') as HTMLElement;
    expect(bloque.getAttribute('data-roto')).toBe('true');
    expect(within(bloque).getByText(/hash de los datos no coincide/i)).toBeTruthy();
    expect(document.querySelectorAll('[data-roto="true"]')).toHaveLength(1);
    // enlace para ir al primer bloque roto
    const enlace = screen.getByRole('link', { name: /ir al bloque 1/i });
    expect(enlace.getAttribute('href')).toBe('#bloque-1');
    expect(bloque.id).toBe('bloque-1');
  });

  it('muestra los 5 chequeos por bloque', () => {
    render(<ReporteVerificacion reporte={roto} />);
    const bloque = document.querySelector('[data-bloque="1"]') as HTMLElement;
    for (const nombre of [
      /hash de datos/i,
      /enlace/i,
      /hash de cadena/i,
      /prueba de trabajo/i,
      /firma del usuario/i,
    ])
      expect(within(bloque).getByText(nombre)).toBeTruthy();
  });

  it('sello en falla con bloques ok (truncamiento): comprometida sin bloque roto', () => {
    render(<ReporteVerificacion reporte={truncada} />);
    expect(screen.getByRole('status').textContent).toMatch(/comprometida/i);
    expect(screen.queryByText(/primer bloque roto/i)).toBeNull();
    const sello = screen.getByRole('region', { name: /sello del servidor/i });
    expect(within(sello).getByText(/falla/i)).toBeTruthy();
    expect(within(sello).getByText(/ya no existe/i)).toBeTruthy();
    expect(document.querySelectorAll('[data-roto="true"]')).toHaveLength(0);
  });
});

describe('Página Verificar', () => {
  it('el botón pide la verificación y muestra el reporte', async () => {
    const mock = simularApi({
      ...sesion('auditor'),
      'GET /api/cadena/verificar': { cuerpo: integro },
    });
    renderizar('/verificar');
    expect(llamadas(mock, 'GET', '/api/cadena/verificar')).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: /verificar integridad/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/íntegra/i);
    expect(llamadas(mock, 'GET', '/api/cadena/verificar')).toHaveLength(1);
  });

  it('el admin también puede verificar y ve el bloque roto', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/cadena/verificar': { cuerpo: roto } });
    renderizar('/verificar');
    await userEvent.click(await screen.findByRole('button', { name: /verificar integridad/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/primer bloque roto: 1/i);
  });

  it('muestra el error de la API', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena/verificar': {
        status: 500,
        cuerpo: { statusCode: 500, mensaje: 'Error interno del servidor' },
      },
    });
    renderizar('/verificar');
    await userEvent.click(await screen.findByRole('button', { name: /verificar integridad/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
  });

  it('estado de carga mientras verifica', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/cadena/verificar': () => new Promise(() => undefined),
    });
    renderizar('/verificar');
    await userEvent.click(await screen.findByRole('button', { name: /verificar integridad/i }));
    expect(await screen.findByText(/verificando/i)).toBeTruthy();
  });

  it('estado vacío antes de verificar', async () => {
    simularApi({ ...sesion('auditor') });
    renderizar('/verificar');
    expect(await screen.findByText(/aún no se ha verificado/i)).toBeTruthy();
  });

  it('el registrador no tiene acceso', async () => {
    simularApi({ ...sesion('registrador') });
    renderizar('/verificar');
    expect(await screen.findByText(/sin permiso/i)).toBeTruthy();
  });
});
