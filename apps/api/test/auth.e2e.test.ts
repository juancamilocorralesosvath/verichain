import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { seedAdmin } from '../src/auth/seed.js';
import { crearBdTemporal } from './ayudantes-bd.js';

describe('Autenticación', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = 'contraseña-segura-123';

  beforeAll(async () => {
    crearBdTemporal();
    process.env['JWT_SECRET'] = 'una-clave-de-prueba-suficientemente-larga';
    process.env['JWT_EXPIRES_IN'] = '15m';
    process.env['ADMIN_USERNAME'] = 'admin';
    process.env['ADMIN_PASSWORD'] = password;
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    await seedAdmin(prisma);
    await seedAdmin(prisma);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('crea el admin una sola vez y guarda argon2id', async () => {
    const usuarios = await prisma.usuario.findMany();
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('inicia sesión con cookie segura y consulta el usuario', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password })
      .expect(201);
    expect(login.body).toEqual({ username: 'admin', rol: 'admin' });
    const cookie = login.headers['set-cookie'][0] as string;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set('Cookie', cookie)
      .expect(200, { username: 'admin', rol: 'admin' });
    await request(app.getHttpServer()).post('/api/auth/logout').expect(201);
  });

  it('no distingue contraseña incorrecta de usuario inexistente', async () => {
    const http = request(app.getHttpServer());
    const mala = await http
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'incorrecta' })
      .expect(401);
    const inexistente = await http
      .post('/api/auth/login')
      .send({ username: 'inexistente', password: 'incorrecta' })
      .expect(401);
    expect(mala.body).toEqual(inexistente.body);
  });

  it('limita a cinco intentos por minuto', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 2; i++)
      await http
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'incorrecta' })
        .expect(401);
    await http
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'incorrecta' })
      .expect(429);
  });
});
