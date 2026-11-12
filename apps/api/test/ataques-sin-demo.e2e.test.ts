import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearBdTemporal } from './ayudantes-bd.js';
import { crearUsuario, type Sesion } from './ayudantes-firma.js';

// Sin DEMO_MODE=true las rutas de ataques no existen, ni siquiera para el admin.
delete process.env['DEMO_MODE'];
const { AppModule } = await import('../src/app.module.js');
const { configurarApp } = await import('../src/configurar-app.js');

describe('Ataques con DEMO_MODE desactivado', () => {
  let app: INestApplication;
  let admin: Sesion;
  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    admin = await crearUsuario(app, 'admin1', 'admin');
  });
  afterAll(async () => {
    await app?.close();
  });

  it('POST /api/ataques/truncar → 404 (también para el admin)', async () => {
    await request(app.getHttpServer())
      .post('/api/ataques/truncar')
      .set('Cookie', admin.cookie)
      .send({})
      .expect(404);
  });

  it('POST /api/demo/snapshot y /restaurar → 404', async () => {
    for (const ruta of ['/api/demo/snapshot', '/api/demo/restaurar']) {
      await request(app.getHttpServer())
        .post(ruta)
        .set('Cookie', admin.cookie)
        .send({})
        .expect(404);
    }
  });

  it('GET /api/ataques → 404', async () => {
    await request(app.getHttpServer()).get('/api/ataques').set('Cookie', admin.cookie).expect(404);
  });

  it('esModoDemo solo es true con DEMO_MODE=true exacto', async () => {
    const { esModoDemo } = await import('../src/ataques/modo-demo.js');
    expect(esModoDemo({ DEMO_MODE: 'true' })).toBe(true);
    for (const valor of ['false', '', 'TRUE', '1', undefined]) {
      expect(esModoDemo({ DEMO_MODE: valor })).toBe(false);
    }
  });
});
