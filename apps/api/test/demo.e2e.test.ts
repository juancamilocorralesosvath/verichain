import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ReporteCadena } from '@bc/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearBdTemporal } from './ayudantes-bd.js';
import {
  crearFirmante,
  crearPersonaFirmada,
  crearUsuario,
  type Firmante,
  type Sesion,
} from './ayudantes-firma.js';

process.env['DEMO_MODE'] = 'true';
const { AppModule } = await import('../src/app.module.js');
const { configurarApp } = await import('../src/configurar-app.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

describe('Snapshot y restaurar demo (DEMO_MODE=true)', () => {
  let app: INestApplication;
  let prisma: InstanceType<typeof PrismaService>;
  let admin: Sesion;
  let auditor: Sesion;
  let ana: Firmante;
  let carpeta: string;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const como = (quien: Sesion, ruta: string, metodo: 'get' | 'post' = 'post') =>
    http()[metodo](ruta).set('Cookie', quien.cookie).send({});
  const verificar = async (): Promise<ReporteCadena> =>
    (await http().get('/api/cadena/verificar').set('Cookie', admin.cookie).expect(200))
      .body as ReporteCadena;

  beforeEach(async () => {
    const url = crearBdTemporal();
    carpeta = dirname(url.replace(/^file:/, ''));
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    admin = await crearUsuario(app, 'admin1', 'admin');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    ana = await crearFirmante(app, 'ana');
    for (let i = 0; i < 3; i++) expect((await crearPersonaFirmada(app, ana)).status).toBe(201);
  });
  afterEach(async () => {
    await app?.close();
  });

  it('snapshot → ataque → restaurar: la cadena vuelve a ser válida con los mismos bloques', async () => {
    const original = await prisma.bloque.count();
    const snap = await como(admin, '/api/demo/snapshot').expect(201);
    expect(snap.body).toMatchObject({ guardado: true, bloques: original });
    expect(existsSync(join(carpeta, 'snapshot.db'))).toBe(true);

    await como(admin, '/api/ataques/reescribir-cadena').expect(201);
    expect((await verificar()).valida).toBe(false);

    const res = await como(admin, '/api/demo/restaurar').expect(201);
    expect(res.body).toMatchObject({ restaurado: true });
    expect(res.body.verificacion.valida).toBe(true);
    expect(res.body.verificacion.totalBloques).toBe(original);
    expect(await prisma.bloque.count()).toBe(original);
    expect((await verificar()).valida).toBe(true);
  });

  it('restaura también un truncamiento y los datos borrados', async () => {
    await como(admin, '/api/demo/snapshot').expect(201);
    const personas = await prisma.persona.count();
    await como(admin, '/api/ataques/truncar').expect(201);
    expect(await prisma.persona.count()).toBe(personas - 1);
    await como(admin, '/api/demo/restaurar').expect(201);
    expect(await prisma.persona.count()).toBe(personas);
    expect((await verificar()).valida).toBe(true);
  });

  it('después de restaurar la API sigue anexando bloques (Prisma no queda con datos viejos)', async () => {
    await como(admin, '/api/demo/snapshot').expect(201);
    await expect(crearPersonaFirmada(app, ana)).resolves.toMatchObject({ status: 201 });
    await como(admin, '/api/demo/restaurar').expect(201);
    expect(await prisma.bloque.count()).toBe(4); // génesis + 3: el anexo posterior al snapshot se descartó
    expect((await crearPersonaFirmada(app, ana)).status).toBe(201);
    expect(await prisma.bloque.count()).toBe(5);
    expect((await verificar()).valida).toBe(true);
  });

  it('un segundo snapshot reemplaza al primero', async () => {
    await como(admin, '/api/demo/snapshot').expect(201);
    await crearPersonaFirmada(app, ana);
    const segundo = await como(admin, '/api/demo/snapshot').expect(201);
    expect(segundo.body.bloques).toBe(5);
    await como(admin, '/api/ataques/truncar').expect(201);
    const res = await como(admin, '/api/demo/restaurar').expect(201);
    expect(res.body.verificacion.totalBloques).toBe(5);
  });

  it('restaurar sin snapshot da 409 con un mensaje claro y no toca la BD', async () => {
    const res = await como(admin, '/api/demo/restaurar').expect(409);
    expect(res.body.mensaje).toMatch(/snapshot/i);
    expect((await verificar()).valida).toBe(true);
  });

  it('solo el admin: auditor y registrador 403, sin sesión 401', async () => {
    for (const ruta of ['/api/demo/snapshot', '/api/demo/restaurar']) {
      await como(auditor, ruta).expect(403);
      await como(ana, ruta).expect(403);
      await http().post(ruta).send({}).expect(401);
    }
  });
});
