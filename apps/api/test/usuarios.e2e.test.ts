import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import { crearUsuario, type Sesion } from './ayudantes-firma.js';

const CLAVE_NUEVA = 'una-clave-larga-segura-1';

interface UsuarioApi {
  id: number;
  username: string;
  rol: string;
  activo: boolean;
  creado_en: string;
}

describe('Gestión de usuarios (admin)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Sesion;
  let registrador: Sesion;
  let auditor: Sesion;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const como = (quien: Sesion, metodo: 'get' | 'post' | 'patch', ruta: string) =>
    http()[metodo](ruta).set('Cookie', quien.cookie);
  const crear = (cuerpo: Record<string, unknown>, quien: Sesion = admin) =>
    como(quien, 'post', '/api/usuarios').send(cuerpo);
  const nuevo = (extra: Record<string, unknown> = {}) => ({
    username: 'luis.gomez',
    password: CLAVE_NUEVA,
    rol: 'registrador',
    ...extra,
  });
  const entrar = (username: string, password: string) =>
    http().post('/api/auth/login').send({ username, password });

  beforeEach(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    admin = await crearUsuario(app, 'admin1', 'admin');
    registrador = await crearUsuario(app, 'registrador1', 'registrador');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
  });
  afterEach(async () => {
    await app?.close();
  });

  it('lista los usuarios sin password_hash', async () => {
    const res = await como(admin, 'get', '/api/usuarios').expect(200);
    const lista = res.body as UsuarioApi[];
    expect(lista.map((u) => u.username)).toEqual(['admin1', 'registrador1', 'auditor1']);
    for (const u of lista) {
      expect(Object.keys(u).sort()).toEqual(['activo', 'creado_en', 'id', 'rol', 'username']);
    }
  });

  it('crea un usuario que puede iniciar sesión con su rol', async () => {
    const res = await crear(nuevo()).expect(201);
    expect(res.body).toMatchObject({ username: 'luis.gomez', rol: 'registrador', activo: true });
    const login = await entrar('luis.gomez', CLAVE_NUEVA).expect(201);
    expect(login.body).toEqual({ username: 'luis.gomez', rol: 'registrador' });
  });

  it('guarda la contraseña con argon2id y nunca la devuelve', async () => {
    const res = await crear(nuevo()).expect(201);
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { username: 'luis.gomez' } });
    expect(fila.password_hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|hash/i);
    const lista = (await como(admin, 'get', '/api/usuarios').expect(200)).text;
    expect(lista).not.toMatch(/password|argon2|hash/i);
    const edicion = await como(admin, 'patch', `/api/usuarios/${res.body.id}`)
      .send({ activo: false })
      .expect(200);
    expect(JSON.stringify(edicion.body)).not.toMatch(/password|argon2|hash/i);
  });

  it.each([
    ['contraseña corta', { password: 'corta-123' }],
    ['contraseña de 11 caracteres', { password: '12345678901' }],
    ['contraseña igual al usuario', { username: 'usuario.largo.x', password: 'usuario.largo.x' }],
    [
      'contraseña igual al usuario sin importar mayúsculas',
      { username: 'Usuario.Largo.X', password: 'usuario.largo.x' },
    ],
    ['contraseña enorme', { password: 'a'.repeat(129) }],
    ['usuario muy corto', { username: 'ab' }],
    ['usuario con caracteres raros', { username: 'luis gomez<script>' }],
    ['rol desconocido', { rol: 'superadmin' }],
    ['campo extra', { activo: true }],
    ['tipos incorrectos', { password: 123456789012 }],
  ])('400: %s', async (_n, extra) => {
    await crear(nuevo(extra)).expect(400);
    expect(await prisma.usuario.count()).toBe(3);
  });

  it('un nombre de usuario repetido da 409 con mensaje genérico', async () => {
    await crear(nuevo()).expect(201);
    const res = await crear(nuevo()).expect(409);
    expect(res.body).toEqual({ statusCode: 409, mensaje: 'Registro duplicado' });
  });

  it('desactivar a un usuario con sesión abierta: su siguiente petición da 401 y ya no puede entrar', async () => {
    const creado = (await crear(nuevo()).expect(201)).body as UsuarioApi;
    const login = await entrar('luis.gomez', CLAVE_NUEVA).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0] ?? '';
    await http().get('/api/auth/yo').set('Cookie', cookie).expect(200);
    const res = await como(admin, 'patch', `/api/usuarios/${creado.id}`)
      .send({ activo: false })
      .expect(200);
    expect(res.body.activo).toBe(false);
    await http().get('/api/auth/yo').set('Cookie', cookie).expect(401);
    await entrar('luis.gomez', CLAVE_NUEVA).expect(401);
    // reactivarlo le devuelve el acceso (el login está limitado a 5 por minuto: se prueba con la sesión anterior)
    await como(admin, 'patch', `/api/usuarios/${creado.id}`).send({ activo: true }).expect(200);
    await http().get('/api/auth/yo').set('Cookie', cookie).expect(200);
  });

  it('cambiar el rol invalida la sesión anterior y el login nuevo trae el rol nuevo', async () => {
    const creado = (await crear(nuevo()).expect(201)).body as UsuarioApi;
    const login = await entrar('luis.gomez', CLAVE_NUEVA).expect(201);
    const vieja = (login.headers['set-cookie'] as unknown as string[])[0] ?? '';
    await como(admin, 'patch', `/api/usuarios/${creado.id}`).send({ rol: 'auditor' }).expect(200);
    await http().get('/api/auth/yo').set('Cookie', vieja).expect(401);
    expect((await entrar('luis.gomez', CLAVE_NUEVA).expect(201)).body.rol).toBe('auditor');
  });

  it('un admin no puede desactivarse ni quitarse el rol de admin (403), pero sí a otro', async () => {
    const yo = (await prisma.usuario.findUniqueOrThrow({ where: { username: 'admin1' } })).id;
    await como(admin, 'patch', `/api/usuarios/${yo}`).send({ activo: false }).expect(403);
    await como(admin, 'patch', `/api/usuarios/${yo}`).send({ rol: 'auditor' }).expect(403);
    await http().get('/api/auth/yo').set('Cookie', admin.cookie).expect(200); // sigue activo y admin
    const otro = (await prisma.usuario.findUniqueOrThrow({ where: { username: 'auditor1' } })).id;
    await como(admin, 'patch', `/api/usuarios/${otro}`).send({ rol: 'admin' }).expect(200);
  });

  it('PATCH: sin campos, campos desconocidos, id inexistente o inválido', async () => {
    const id = (await prisma.usuario.findUniqueOrThrow({ where: { username: 'auditor1' } })).id;
    await como(admin, 'patch', `/api/usuarios/${id}`).send({}).expect(400);
    await como(admin, 'patch', `/api/usuarios/${id}`)
      .send({ password: 'otra-clave-larga-2' })
      .expect(400);
    await como(admin, 'patch', `/api/usuarios/${id}`).send({ rol: 'dios' }).expect(400);
    await como(admin, 'patch', `/api/usuarios/${id}`).send({ activo: 'si' }).expect(400);
    await como(admin, 'patch', '/api/usuarios/99999').send({ activo: false }).expect(404);
    await como(admin, 'patch', '/api/usuarios/abc').send({ activo: false }).expect(400);
  });

  it('solo el admin: registrador y auditor 403 en los tres endpoints; sin sesión 401', async () => {
    for (const quien of [registrador, auditor]) {
      await como(quien, 'get', '/api/usuarios').expect(403);
      await crear(nuevo(), quien).expect(403);
      await como(quien, 'patch', '/api/usuarios/1').send({ activo: false }).expect(403);
    }
    await http().get('/api/usuarios').expect(401);
    await http().post('/api/usuarios').send(nuevo()).expect(401);
    await http().patch('/api/usuarios/1').send({ activo: false }).expect(401);
    expect(await prisma.usuario.count()).toBe(3);
  });

  it('no existe forma de borrar usuarios', async () => {
    await http().delete('/api/usuarios/1').set('Cookie', admin.cookie).expect(404);
  });

  it('deja entradas en la bitácora sin la contraseña', async () => {
    const creado = (await crear(nuevo()).expect(201)).body as UsuarioApi;
    await como(admin, 'patch', `/api/usuarios/${creado.id}`)
      .send({ activo: false, rol: 'auditor' })
      .expect(200);
    const filas = await prisma.bitacora.findMany({ orderBy: { id: 'asc' } });
    const crearE = filas.find((f) => f.accion === 'usuario_crear');
    const editarE = filas.find((f) => f.accion === 'usuario_editar');
    expect(crearE).toMatchObject({ usuario: 'admin1', resultado: 'ok' });
    expect(crearE?.detalle).toContain('luis.gomez');
    expect(editarE).toMatchObject({ usuario: 'admin1', resultado: 'ok' });
    expect(editarE?.detalle).toMatch(/activo=false/);
    expect(editarE?.detalle).toMatch(/rol=auditor/);
    expect(JSON.stringify(filas)).not.toContain(CLAVE_NUEVA);
  });
});
