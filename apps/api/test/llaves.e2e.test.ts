import { generateKeyPairSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { LlavesService } from '../src/llaves/llaves.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';

const nuevaLlave = (curva = 'prime256v1'): string =>
  generateKeyPairSync('ec', { namedCurve: curva })
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64');
const llaveRsa = (): string =>
  generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64');

interface LlaveApi {
  id: number;
  version: number;
  estado: string;
  spki_b64: string;
  username?: string;
}

describe('Llaves públicas de los usuarios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const cookies: Record<string, string> = {};
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const como = (rol: string, metodo: 'get' | 'post', ruta: string): request.Test => {
    const req = http()[metodo](ruta);
    return cookies[rol] ? req.set('Cookie', cookies[rol]) : req;
  };
  const registrar = (rol = 'registrador', spki_b64: unknown = nuevaLlave()): request.Test =>
    como(rol, 'post', '/api/llaves').send({ spki_b64 });

  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const password_hash = await hash('password-para-pruebas');
    for (const rol of ['admin', 'registrador', 'auditor', 'registrador2']) {
      const base = rol.replace('2', '');
      await prisma.usuario.create({ data: { username: `${rol}1`, rol: base, password_hash } });
      const res = await http()
        .post('/api/auth/login')
        .send({ username: `${rol}1`, password: 'password-para-pruebas' });
      cookies[rol] = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  it('registrar deja la llave pendiente (versión 1); el admin la aprueba', async () => {
    const res = await registrar().expect(201);
    expect(res.body).toMatchObject({ version: 1, estado: 'pendiente' });
    const aprobada = await como('admin', 'post', `/api/llaves/${res.body.id}/aprobar`).expect(200);
    expect(aprobada.body).toMatchObject({ id: res.body.id, estado: 'aprobada', version: 1 });
  });

  it('rotar: la nueva queda en versión 2 y la anterior pasa a reemplazada', async () => {
    const primera = (await como('registrador', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    const vigente = primera.find((l) => l.estado === 'aprobada') as LlaveApi;
    const nueva = await registrar().expect(201);
    expect(nueva.body.version).toBe(2);
    await como('admin', 'post', `/api/llaves/${nueva.body.id}/aprobar`).expect(200);

    const mias = (await como('registrador', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    expect(mias.find((l) => l.id === vigente.id)?.estado).toBe('reemplazada');
    expect(mias.find((l) => l.id === nueva.body.id)?.estado).toBe('aprobada');
    expect(mias.filter((l) => l.estado === 'aprobada')).toHaveLength(1);
  });

  it.each([
    ['llave RSA', () => llaveRsa()],
    ['curva P-384', () => nuevaLlave('secp384r1')],
    ['base64 basura', () => 'esto-no-es-una-llave!!'],
    ['base64 válido que no es SPKI', () => Buffer.from('hola mundo').toString('base64')],
    ['cadena vacía', () => ''],
    ['tipo incorrecto', () => 12345],
  ])('400: %s', async (_n, valor) => {
    await registrar('registrador', valor()).expect(400);
  });

  it('400 con un campo extra en el cuerpo', async () => {
    await como('registrador', 'post', '/api/llaves')
      .send({ spki_b64: nuevaLlave(), rol: 'admin' })
      .expect(400);
  });

  it('409 si la misma llave ya está registrada (aunque sea de otro usuario)', async () => {
    const llave = nuevaLlave();
    await registrar('registrador', llave).expect(201);
    const res = await registrar('registrador2', llave).expect(409);
    expect(res.body).toEqual({ statusCode: 409, mensaje: 'Registro duplicado' });
  });

  it('aprobar o rechazar una llave que no está pendiente da 409', async () => {
    const mias = (await como('registrador', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    const aprobada = mias.find((l) => l.estado === 'aprobada') as LlaveApi;
    await como('admin', 'post', `/api/llaves/${aprobada.id}/aprobar`).expect(409);
    await como('admin', 'post', `/api/llaves/${aprobada.id}/rechazar`).expect(409);
  });

  it('id inexistente da 404 e id no numérico da 400', async () => {
    await como('admin', 'post', '/api/llaves/99999/aprobar').expect(404);
    await como('admin', 'post', '/api/llaves/abc/aprobar').expect(400);
  });

  it('rechazar deja la llave rechazada y no toca la aprobada vigente', async () => {
    const nueva = await registrar().expect(201);
    const antes = (await como('registrador', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    const vigente = antes.find((l) => l.estado === 'aprobada') as LlaveApi;
    const res = await como('admin', 'post', `/api/llaves/${nueva.body.id}/rechazar`).expect(200);
    expect(res.body.estado).toBe('rechazada');
    const despues = (await como('registrador', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    expect(despues.find((l) => l.id === vigente.id)?.estado).toBe('aprobada');
  });

  it('/mias solo trae las llaves del usuario; /pendientes solo las pendientes, con su dueño', async () => {
    const mias = (await como('registrador2', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    expect(mias).toHaveLength(0); // la llave repetida del test de duplicados no se creó
    const rop = await registrar('registrador2').expect(201);
    const suyas = (await como('registrador2', 'get', '/api/llaves/mias').expect(200))
      .body as LlaveApi[];
    expect(suyas.map((l) => l.id)).toEqual([rop.body.id]);
    const pendientes = (await como('admin', 'get', '/api/llaves/pendientes').expect(200))
      .body as LlaveApi[];
    expect(pendientes.length).toBeGreaterThan(0);
    expect(pendientes.every((l) => l.estado === 'pendiente')).toBe(true);
    expect(pendientes.find((l) => l.id === rop.body.id)?.username).toBe('registrador21');
  });

  it('la respuesta no expone campos internos', async () => {
    const mias = (await como('registrador', 'get', '/api/llaves/mias').expect(200)).body as Array<
      Record<string, unknown>
    >;
    for (const llave of mias) {
      expect(Object.keys(llave).sort()).toEqual(
        ['aprobada_en', 'creado_en', 'estado', 'id', 'spki_b64', 'version'].sort(),
      );
    }
  });

  describe('permisos (matriz §7b)', () => {
    const casos = [
      { metodo: 'post', ruta: '/api/llaves', ok: 'registrador' },
      { metodo: 'get', ruta: '/api/llaves/mias', ok: 'registrador' },
      { metodo: 'get', ruta: '/api/llaves/pendientes', ok: 'admin' },
      { metodo: 'post', ruta: '/api/llaves/99999/aprobar', ok: 'admin' },
      { metodo: 'post', ruta: '/api/llaves/99999/rechazar', ok: 'admin' },
    ] as const;
    for (const { metodo, ruta, ok } of casos) {
      for (const rol of ['admin', 'registrador', 'auditor']) {
        if (rol === ok) continue;
        it(`${metodo} ${ruta}: ${rol} → 403`, async () => {
          const req = como(rol, metodo, ruta);
          if (metodo === 'post') req.send({ spki_b64: nuevaLlave() });
          await req.expect(403);
        });
      }
      it(`${metodo} ${ruta}: sin sesión → 401`, async () => {
        await como('nadie', metodo, ruta).expect(401);
      });
    }
  });

  it('llavesParaVerificacion incluye aprobadas y reemplazadas, y excluye pendientes y rechazadas', async () => {
    const todas = await prisma.llaveUsuario.findMany();
    const esperadas = todas.filter((l) => ['aprobada', 'reemplazada'].includes(l.estado));
    const excluidas = todas.filter((l) => ['pendiente', 'rechazada'].includes(l.estado));
    expect(esperadas.length).toBeGreaterThanOrEqual(2);
    expect(excluidas.length).toBeGreaterThanOrEqual(1);
    const mapa = await app.get(LlavesService).llavesParaVerificacion();
    expect(Object.keys(mapa).map(Number).sort()).toEqual(esperadas.map((l) => l.id).sort());
    for (const l of esperadas) expect(mapa[l.id]).toBe(l.spki_b64);
  });

  it('la BD impide dos llaves aprobadas para el mismo usuario', async () => {
    const aprobada = await prisma.llaveUsuario.findFirstOrThrow({ where: { estado: 'aprobada' } });
    await expect(
      prisma.llaveUsuario.create({
        data: {
          usuario_id: aprobada.usuario_id,
          version: 999,
          spki_b64: nuevaLlave(),
          estado: 'aprobada',
        },
      }),
    ).rejects.toThrow();
  });
});
