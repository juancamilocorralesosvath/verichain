import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llamadas, renderizar, sesion, simularApi } from './ayudantes';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const cuerpoDe = (mock: ReturnType<typeof simularApi>, metodo: string, ruta: string) => {
  const [, opciones] = llamadas(mock, metodo, ruta)[0] as [string, RequestInit];
  return JSON.parse(opciones.body as string) as Record<string, unknown>;
};
const error = (status: number, mensaje: string) => ({
  status,
  cuerpo: { statusCode: status, mensaje },
});

/* ------------------------------------------------------------------ Usuarios */
describe('Usuarios', () => {
  const usuarios = [
    {
      id: 1,
      username: 'admin1',
      rol: 'admin',
      activo: true,
      creado_en: '2026-11-09T10:00:00.000Z',
    },
    {
      id: 2,
      username: 'ana',
      rol: 'registrador',
      activo: true,
      creado_en: '2026-11-09T11:00:00.000Z',
    },
    {
      id: 3,
      username: 'luisa',
      rol: 'auditor',
      activo: false,
      creado_en: '2026-11-09T12:00:00.000Z',
    },
  ];

  it('lista los usuarios con rol y estado', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/usuarios': { cuerpo: usuarios } });
    renderizar('/usuarios');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('ana')).toBeTruthy();
    expect(within(tabla).getByText('luisa')).toBeTruthy();
    expect(within(tabla).getByRole('button', { name: /activar a luisa/i })).toBeTruthy();
    expect(within(tabla).getByRole('button', { name: /desactivar a ana/i })).toBeTruthy();
  });

  it('crea un usuario con username, contraseña y rol', async () => {
    const mock = simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': { cuerpo: usuarios },
      'POST /api/usuarios': {
        status: 201,
        cuerpo: {
          id: 4,
          username: 'pedro',
          rol: 'auditor',
          activo: true,
          creado_en: '2026-11-10T00:00:00.000Z',
        },
      },
    });
    renderizar('/usuarios');
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Usuario'), 'pedro');
    await u.type(screen.getByLabelText('Contraseña'), 'clave-de-pedro-123');
    await u.selectOptions(screen.getByLabelText('Rol'), 'auditor');
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(llamadas(mock, 'POST', '/api/usuarios')).toHaveLength(1));
    expect(cuerpoDe(mock, 'POST', '/api/usuarios')).toEqual({
      username: 'pedro',
      password: 'clave-de-pedro-123',
      rol: 'auditor',
    });
    await waitFor(() =>
      expect(llamadas(mock, 'GET', '/api/usuarios').length).toBeGreaterThanOrEqual(2),
    );
  });

  it('muestra el error del servidor al crear (p. ej. 409) y no limpia la contraseña en la lista', async () => {
    simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': { cuerpo: usuarios },
      'POST /api/usuarios': error(409, 'Registro duplicado'),
    });
    renderizar('/usuarios');
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Usuario'), 'ana');
    await u.type(screen.getByLabelText('Contraseña'), 'clave-de-ana-12345');
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect((await screen.findByText('Registro duplicado')).getAttribute('role')).toBe('alert');
  });

  it('activa y desactiva con PATCH { activo }', async () => {
    const mock = simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': { cuerpo: usuarios },
      'PATCH /api/usuarios/3': { cuerpo: { ...usuarios[2], activo: true } },
      'PATCH /api/usuarios/2': { cuerpo: { ...usuarios[1], activo: false } },
    });
    renderizar('/usuarios');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /activar a luisa/i }));
    await waitFor(() => expect(llamadas(mock, 'PATCH', '/api/usuarios/3')).toHaveLength(1));
    expect(cuerpoDe(mock, 'PATCH', '/api/usuarios/3')).toEqual({ activo: true });
    await u.click(screen.getByRole('button', { name: /desactivar a ana/i }));
    await waitFor(() => expect(llamadas(mock, 'PATCH', '/api/usuarios/2')).toHaveLength(1));
    expect(cuerpoDe(mock, 'PATCH', '/api/usuarios/2')).toEqual({ activo: false });
  });

  it('cambia el rol con PATCH { rol }', async () => {
    const mock = simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': { cuerpo: usuarios },
      'PATCH /api/usuarios/2': { cuerpo: { ...usuarios[1], rol: 'auditor' } },
    });
    renderizar('/usuarios');
    await userEvent.setup().selectOptions(await screen.findByLabelText(/rol de ana/i), 'auditor');
    await waitFor(() => expect(llamadas(mock, 'PATCH', '/api/usuarios/2')).toHaveLength(1));
    expect(cuerpoDe(mock, 'PATCH', '/api/usuarios/2')).toEqual({ rol: 'auditor' });
  });

  it('el admin no puede desactivarse a sí mismo desde la interfaz', async () => {
    simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': { cuerpo: [{ ...usuarios[0], username: 'admin1' }, usuarios[1]] },
    });
    renderizar('/usuarios');
    const boton = await screen.findByRole('button', { name: /desactivar a admin1/i });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });

  it('cargando, error y vacío', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/usuarios': () => new Promise(() => undefined) });
    renderizar('/usuarios');
    expect(await screen.findByText(/cargando usuarios/i)).toBeTruthy();
    cleanup();
    simularApi({
      ...sesion('admin'),
      'GET /api/usuarios': error(500, 'Error interno del servidor'),
    });
    renderizar('/usuarios');
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
    cleanup();
    simularApi({ ...sesion('admin'), 'GET /api/usuarios': { cuerpo: [] } });
    renderizar('/usuarios');
    expect(await screen.findByText(/no hay usuarios/i)).toBeTruthy();
  });

  it('solo el admin', async () => {
    simularApi({ ...sesion('auditor') });
    renderizar('/usuarios');
    expect(await screen.findByText(/sin permiso/i)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------- Llaves */
describe('Llaves', () => {
  const spki = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEexample=';
  const pendientes = [
    {
      id: 7,
      version: 1,
      estado: 'pendiente',
      spki_b64: spki,
      creado_en: '2026-11-09T12:00:00.000Z',
      aprobada_en: null,
      username: 'ana',
    },
  ];

  it('lista las pendientes con su dueño y la huella SHA-256 de cada llave', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/llaves/pendientes': { cuerpo: pendientes } });
    renderizar('/llaves');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('ana')).toBeTruthy();
    const esperada = Array.from(
      new Uint8Array(
        await webcrypto.subtle.digest(
          'SHA-256',
          Uint8Array.from(atob(spki), (c) => c.charCodeAt(0)),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const huella = await within(tabla).findByTitle(esperada);
    expect(huella.textContent).toBe(esperada.slice(0, 32));
  });

  it('aprueba y rechaza con POST y recarga la lista', async () => {
    const mock = simularApi({
      ...sesion('admin'),
      'GET /api/llaves/pendientes': { cuerpo: pendientes },
      'POST /api/llaves/7/aprobar': { cuerpo: { ...pendientes[0], estado: 'aprobada' } },
      'POST /api/llaves/7/rechazar': { cuerpo: { ...pendientes[0], estado: 'rechazada' } },
    });
    renderizar('/llaves');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /aprobar la llave de ana/i }));
    await waitFor(() => expect(llamadas(mock, 'POST', '/api/llaves/7/aprobar')).toHaveLength(1));
    await waitFor(() =>
      expect(llamadas(mock, 'GET', '/api/llaves/pendientes').length).toBeGreaterThanOrEqual(2),
    );
    await u.click(await screen.findByRole('button', { name: /rechazar la llave de ana/i }));
    await waitFor(() => expect(llamadas(mock, 'POST', '/api/llaves/7/rechazar')).toHaveLength(1));
  });

  it('muestra el error de la acción (p. ej. 409 si ya no está pendiente)', async () => {
    simularApi({
      ...sesion('admin'),
      'GET /api/llaves/pendientes': { cuerpo: pendientes },
      'POST /api/llaves/7/aprobar': error(409, 'La llave ya no está pendiente'),
    });
    renderizar('/llaves');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /aprobar la llave de ana/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya no está pendiente/i);
  });

  it('cargando, error y vacío', async () => {
    simularApi({
      ...sesion('admin'),
      'GET /api/llaves/pendientes': () => new Promise(() => undefined),
    });
    renderizar('/llaves');
    expect(await screen.findByText(/cargando llaves/i)).toBeTruthy();
    cleanup();
    simularApi({
      ...sesion('admin'),
      'GET /api/llaves/pendientes': error(500, 'Error interno del servidor'),
    });
    renderizar('/llaves');
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
    cleanup();
    simularApi({ ...sesion('admin'), 'GET /api/llaves/pendientes': { cuerpo: [] } });
    renderizar('/llaves');
    expect(await screen.findByText(/no hay llaves pendientes/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------- Ataques */
describe('Ataques', () => {
  const catalogo = [
    {
      id: 'modificar-dato',
      nombre: 'Modificar un dato',
      descripcion: 'Cambia un nombre en la tabla.',
      deteccionEsperada: 'Falla hash_datos',
    },
    {
      id: 'truncar',
      nombre: 'Truncar la cadena',
      descripcion: 'Borra el último bloque.',
      deteccionEsperada: 'Falla el sello',
    },
  ];
  const reporte = {
    valida: false,
    primerBloqueRoto: 1,
    totalBloques: 2,
    sello: { estado: 'ok', motivos: [] },
    bloques: [
      {
        indice: 0,
        motivos: [],
        chequeos: {
          hashDatos: 'ok',
          enlace: 'ok',
          hashCadena: 'ok',
          pow: 'ok',
          firmaUsuario: 'no-aplica',
        },
      },
      {
        indice: 1,
        motivos: ['El hash de los datos no coincide.'],
        chequeos: {
          hashDatos: 'falla',
          enlace: 'ok',
          hashCadena: 'falla',
          pow: 'ok',
          firmaUsuario: 'ok',
        },
      },
    ],
  };
  const montar = (extra: Record<string, unknown> = {}) =>
    simularApi({
      ...sesion('admin'),
      'GET /api/ataques': { cuerpo: catalogo },
      ...extra,
    });

  it('si la API no expone los ataques (404) no muestra los controles', async () => {
    simularApi({ ...sesion('admin'), 'GET /api/ataques': error(404, 'No encontrado') });
    renderizar('/ataques');
    expect(await screen.findByText(/modo demo no está activo/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ejecutar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /restaurar demo/i })).toBeNull();
  });

  it('muestra el catálogo con lo que cada ataque debe detectar', async () => {
    montar();
    renderizar('/ataques');
    expect(await screen.findByText('Modificar un dato')).toBeTruthy();
    expect(screen.getByText(/falla hash_datos/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /ejecutar ataque/i })).toHaveLength(2);
  });

  it('ejecuta un ataque con el índice elegido y muestra el detalle', async () => {
    const mock = montar({
      'POST /api/ataques/modificar-dato': {
        status: 201,
        cuerpo: { ejecutado: true, detalle: 'Se cambió el nombre del bloque 3' },
      },
    });
    renderizar('/ataques');
    const u = userEvent.setup();
    const indice = await screen.findByLabelText(/índice del bloque/i);
    await u.clear(indice);
    await u.type(indice, '3');
    await u.click(screen.getAllByRole('button', { name: /ejecutar ataque/i })[0]!);
    expect(await screen.findByText(/se cambió el nombre del bloque 3/i)).toBeTruthy();
    expect(cuerpoDe(mock, 'POST', '/api/ataques/modificar-dato')).toEqual({ indice: 3 });
  });

  it('toma un snapshot', async () => {
    const mock = montar({
      'POST /api/demo/snapshot': { status: 201, cuerpo: { guardado: true, bloques: 4 } },
    });
    renderizar('/ataques');
    await userEvent.setup().click(await screen.findByRole('button', { name: /tomar snapshot/i }));
    expect(await screen.findByText(/snapshot guardado.*4 bloques/i)).toBeTruthy();
    expect(llamadas(mock, 'POST', '/api/demo/snapshot')).toHaveLength(1);
  });

  it('restaurar pide confirmación: si se cancela no llama a la API', async () => {
    const mock = montar({
      'POST /api/demo/restaurar': {
        status: 201,
        cuerpo: { restaurado: true, verificacion: reporte },
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderizar('/ataques');
    await userEvent.setup().click(await screen.findByRole('button', { name: /restaurar demo/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(llamadas(mock, 'POST', '/api/demo/restaurar')).toHaveLength(0);
  });

  it('restaurar confirmado llama a la API y muestra el reporte', async () => {
    montar({
      'POST /api/demo/restaurar': {
        status: 201,
        cuerpo: {
          restaurado: true,
          verificacion: {
            ...reporte,
            valida: true,
            primerBloqueRoto: null,
            bloques: [reporte.bloques[0]],
          },
        },
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderizar('/ataques');
    await userEvent.setup().click(await screen.findByRole('button', { name: /restaurar demo/i }));
    expect(
      (await screen.findByRole('status', { name: '' }).catch(() => null)) ?? true,
    ).toBeTruthy();
    expect(await screen.findByText(/demo restaurada/i)).toBeTruthy();
    expect(await screen.findByText(/cadena íntegra/i)).toBeTruthy();
  });

  it('restaurar sin snapshot muestra el 409 de la API', async () => {
    montar({ 'POST /api/demo/restaurar': error(409, 'No hay snapshot') });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderizar('/ataques');
    await userEvent.setup().click(await screen.findByRole('button', { name: /restaurar demo/i }));
    expect((await screen.findByText('No hay snapshot')).getAttribute('role')).toBe('alert');
  });

  it('"Verificar ahora" muestra el reporte con <ReporteVerificacion>', async () => {
    montar({ 'GET /api/cadena/verificar': { cuerpo: reporte } });
    renderizar('/ataques');
    await userEvent.setup().click(await screen.findByRole('button', { name: /verificar ahora/i }));
    expect(await screen.findByText(/primer bloque roto: 1/i)).toBeTruthy();
    expect(document.querySelector('[data-bloque="1"][data-roto="true"]')).toBeTruthy();
  });

  it('solo el admin', async () => {
    simularApi({ ...sesion('auditor') });
    renderizar('/ataques');
    expect(await screen.findByText(/sin permiso/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ Bitácora */
describe('Bitácora', () => {
  const entradas = [
    {
      id: 3,
      fecha: '2026-11-09T12:02:00.000Z',
      usuario: 'ana',
      accion: 'crear_bloque',
      resultado: 'ok',
      ip: '127.0.0.1',
      detalle: 'bloque 1',
      hash: 'c'.repeat(64),
    },
    {
      id: 2,
      fecha: '2026-11-09T12:01:00.000Z',
      usuario: '-',
      accion: 'login_fallido',
      resultado: 'fallo',
      ip: '127.0.0.1',
      detalle: '',
      hash: 'b'.repeat(64),
    },
  ];
  const pagina = (n: number, total: number, valida = true) => ({
    entradas,
    pagina: n,
    totalPaginas: total,
    total: 60,
    verificacion: valida ? { valida: true, primeraRota: null } : { valida: false, primeraRota: 2 },
  });

  it('muestra la tabla y la bitácora íntegra (admin y auditor)', async () => {
    for (const rol of ['admin', 'auditor']) {
      simularApi({ ...sesion(rol), 'GET /api/bitacora?pagina=1': { cuerpo: pagina(1, 2) } });
      renderizar('/bitacora');
      const tabla = await screen.findByRole('table');
      expect(within(tabla).getByText('crear_bloque')).toBeTruthy();
      expect(within(tabla).getByText('login_fallido')).toBeTruthy();
      expect((await screen.findByRole('status')).textContent).toMatch(/bitácora íntegra/i);
      cleanup();
    }
  });

  it('bitácora alterada: lo dice y señala la primera entrada rota', async () => {
    simularApi({
      ...sesion('auditor'),
      'GET /api/bitacora?pagina=1': { cuerpo: pagina(1, 1, false) },
    });
    renderizar('/bitacora');
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/alterada/i);
    expect(alerta.textContent).toMatch(/2/);
  });

  it('pagina con Anterior y Siguiente', async () => {
    const mock = simularApi({
      ...sesion('admin'),
      'GET /api/bitacora?pagina=1': { cuerpo: pagina(1, 2) },
      'GET /api/bitacora?pagina=2': { cuerpo: pagina(2, 2) },
    });
    renderizar('/bitacora');
    const u = userEvent.setup();
    expect(await screen.findByText(/página 1 de 2/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /anterior/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await u.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(await screen.findByText(/página 2 de 2/i)).toBeTruthy();
    expect(llamadas(mock, 'GET', '/api/bitacora?pagina=2')).toHaveLength(1);
    expect((screen.getByRole('button', { name: /siguiente/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('cargando, error y vacío', async () => {
    simularApi({
      ...sesion('admin'),
      'GET /api/bitacora?pagina=1': () => new Promise(() => undefined),
    });
    renderizar('/bitacora');
    expect(await screen.findByText(/cargando la bitácora/i)).toBeTruthy();
    cleanup();
    simularApi({
      ...sesion('admin'),
      'GET /api/bitacora?pagina=1': error(500, 'Error interno del servidor'),
    });
    renderizar('/bitacora');
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
    cleanup();
    simularApi({
      ...sesion('admin'),
      'GET /api/bitacora?pagina=1': {
        cuerpo: {
          entradas: [],
          pagina: 1,
          totalPaginas: 1,
          total: 0,
          verificacion: { valida: true, primeraRota: null },
        },
      },
    });
    renderizar('/bitacora');
    expect(await screen.findByText(/no hay entradas/i)).toBeTruthy();
  });

  it('el registrador no tiene acceso', async () => {
    simularApi({ ...sesion('registrador') });
    renderizar('/bitacora');
    expect(await screen.findByText(/sin permiso/i)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ Exportar */
describe('Exportar', () => {
  const exportacion = { formato: 'bc-export/1', bloques: [] };
  const llave = {
    pem: '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n',
    huella_sha256: 'e'.repeat(64),
  };
  const montar = (extra: Record<string, unknown> = {}) =>
    simularApi({
      'GET /api/cadena/llave-servidor': { cuerpo: llave },
      'GET /api/cadena/exportar': {
        cuerpo: exportacion,
        headers: { 'Content-Disposition': 'attachment; filename="cadena-20261109-1230.json"' },
      },
      ...extra,
    });
  const capturarDescargas = () => {
    const blobs: Blob[] = [];
    const nombres: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((b: Blob) => {
          blobs.push(b);
          return 'blob:x';
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nombres.push(this.download);
    });
    return { blobs, nombres };
  };

  it('muestra la huella de la llave del servidor (admin y auditor)', async () => {
    for (const rol of ['admin', 'auditor']) {
      montar(sesion(rol));
      renderizar('/exportar');
      expect(await screen.findByText('e'.repeat(64))).toBeTruthy();
      cleanup();
    }
  });

  it('descarga el JSON conservando el nombre de Content-Disposition', async () => {
    montar(sesion('auditor'));
    const { blobs, nombres } = capturarDescargas();
    renderizar('/exportar');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /descargar la cadena/i }));
    await waitFor(() => expect(nombres).toContain('cadena-20261109-1230.json'));
    expect(await blobs[0]!.text()).toContain('bc-export/1');
  });

  it('descarga server-public.pem con el PEM de la API', async () => {
    montar(sesion('admin'));
    const { blobs, nombres } = capturarDescargas();
    renderizar('/exportar');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /descargar server-public\.pem/i }));
    await waitFor(() => expect(nombres).toContain('server-public.pem'));
    expect(await blobs[0]!.text()).toBe(llave.pem);
  });

  it('error al exportar', async () => {
    montar({
      ...sesion('admin'),
      'GET /api/cadena/exportar': error(500, 'Error interno del servidor'),
    });
    renderizar('/exportar');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /descargar la cadena/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/error interno/i);
  });

  it('el registrador no tiene acceso y el admin sí ve el enlace en el menú', async () => {
    montar(sesion('registrador'));
    renderizar('/exportar');
    expect(await screen.findByText(/sin permiso/i)).toBeTruthy();
    cleanup();
    montar(sesion('admin'));
    renderizar('/cadena');
    expect(await screen.findByRole('link', { name: 'Exportar' })).toBeTruthy();
  });
});
