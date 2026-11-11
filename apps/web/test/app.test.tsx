import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

const menus: Record<string, string[]> = {
  registrador: ['Personas', 'Cadena', 'Mi llave'],
  auditor: ['Personas', 'Cadena', 'Verificar', 'Bitácora', 'Exportar'],
  admin: ['Cadena', 'Verificar', 'Bitácora', 'Usuarios', 'Llaves', 'Ataques'],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('menú y rutas', () => {
  for (const [rol, enlaces] of Object.entries(menus)) {
    it(`muestra el menú de ${rol}`, async () => {
      // las páginas de datos (H9.2) también piden listas: solo /auth/yo devuelve el usuario
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(url.endsWith('/auth/yo') ? { username: 'ana', rol } : []),
        })),
      );
      render(
        <MemoryRouter initialEntries={['/cadena']}>
          <App />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByRole('navigation')).toBeTruthy());
      for (const nombre of enlaces) expect(screen.getByRole('link', { name: nombre })).toBeTruthy();
      const todos = [
        'Personas',
        'Cadena',
        'Mi llave',
        'Verificar',
        'Bitácora',
        'Exportar',
        'Usuarios',
        'Llaves',
        'Ataques',
      ];
      for (const nombre of todos.filter((item) => !enlaces.includes(item)))
        expect(screen.queryByRole('link', { name: nombre })).toBeNull();
      expect(screen.getByRole('link', { name: 'Verificador independiente' })).toBeTruthy();
    });
  }
  it('redirige al login sin sesión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ mensaje: 'Sesión inválida' }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/cadena']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
  });
  it('muestra sin permiso al entrar en una ruta de otro rol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ username: 'ana', rol: 'auditor' }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });
});
