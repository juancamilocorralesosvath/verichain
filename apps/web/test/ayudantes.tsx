import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../src/App';

export interface Respuesta {
  status?: number;
  cuerpo: unknown;
  /** Cabeceras de la respuesta (p. ej. Content-Disposition en las descargas). */
  headers?: Record<string, string>;
}
type Manejador = Respuesta | (() => Respuesta | Promise<Respuesta>);

/** Simula `fetch` por "MÉTODO /ruta". Lo no declarado responde 404. */
export function simularApi(rutas: Record<string, Manejador>) {
  const mock = vi.fn(async (url: string, opciones: RequestInit = {}) => {
    const manejador = rutas[`${opciones.method ?? 'GET'} ${url}`];
    const {
      status = 200,
      cuerpo,
      headers = {},
    } = manejador
      ? typeof manejador === 'function'
        ? await manejador()
        : manejador
      : { status: 404, cuerpo: { statusCode: 404, mensaje: 'No encontrado' } };
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (nombre: string) => headers[nombre] ?? null },
      text: async () => JSON.stringify(cuerpo),
      json: async () => cuerpo,
    };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export const sesion = (rol: string): Record<string, Manejador> => ({
  'GET /api/auth/yo': { cuerpo: { username: `${rol}1`, rol } },
});

export function renderizar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

/** Llamadas a fetch con un método y ruta dados. */
export function llamadas(mock: ReturnType<typeof simularApi>, metodo: string, ruta: string) {
  return mock.mock.calls.filter(
    ([url, opciones]) =>
      url === ruta && ((opciones as RequestInit | undefined)?.method ?? 'GET') === metodo,
  );
}
