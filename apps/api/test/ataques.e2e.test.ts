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

// El módulo de ataques solo existe con DEMO_MODE=true: se fija antes de cargar AppModule.
process.env['DEMO_MODE'] = 'true';
const { AppModule } = await import('../src/app.module.js');
const { configurarApp } = await import('../src/configurar-app.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

describe('Simulación de ataques (DEMO_MODE=true)', () => {
  let app: INestApplication;
  let prisma: InstanceType<typeof PrismaService>;
  let admin: Sesion;
  let auditor: Sesion;
  let ana: Firmante;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const atacar = (id: string, cuerpo: Record<string, unknown> = {}, quien: Sesion = admin) =>
    http().post(`/api/ataques/${id}`).set('Cookie', quien.cookie).send(cuerpo);
  const verificar = async (): Promise<ReporteCadena> =>
    (await http().get('/api/cadena/verificar').set('Cookie', admin.cookie).expect(200))
      .body as ReporteCadena;

  beforeEach(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    admin = await crearUsuario(app, 'admin1', 'admin');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    ana = await crearFirmante(app, 'ana');
    for (let i = 0; i < 3; i++) expect((await crearPersonaFirmada(app, ana)).status).toBe(201);
    expect((await verificar()).valida).toBe(true); // punto de partida: cadena íntegra
  });
  afterEach(async () => {
    await app?.close();
  });

  const fallas = (r: ReporteCadena, indice: number): string[] =>
    Object.entries(r.bloques[indice]?.chequeos ?? {})
      .filter(([, v]) => v === 'falla')
      .map(([k]) => k);

  it('el catálogo lista los 5 ataques con su detección esperada', async () => {
    const res = await http().get('/api/ataques').set('Cookie', admin.cookie).expect(200);
    expect((res.body as Array<{ id: string }>).map((a) => a.id).sort()).toEqual([
      'modificar-cifrado',
      'modificar-dato',
      'reescribir-cadena',
      'reordenar',
      'truncar',
    ]);
    for (const a of res.body as Array<Record<string, string>>) {
      expect(Object.keys(a).sort()).toEqual(['descripcion', 'deteccionEsperada', 'id', 'nombre']);
      expect(a['deteccionEsperada']).toBeTruthy();
    }
  });

  it('modificar-dato: falla hashDatos y hashCadena del bloque atacado', async () => {
    const res = await atacar('modificar-dato', { indice: 2 }).expect(201);
    expect(res.body).toMatchObject({ ejecutado: true });
    expect(typeof res.body.detalle).toBe('string');
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBe(2);
    expect(fallas(r, 2)).toEqual(expect.arrayContaining(['hashDatos', 'hashCadena']));
  });

  it('por defecto ataca el bloque 1', async () => {
    await atacar('modificar-dato').expect(201);
    expect((await verificar()).primerBloqueRoto).toBe(1);
  });

  it('modificar-cifrado: falla hashDatos (el texto cifrado ya no coincide)', async () => {
    const antes = (await prisma.persona.findFirstOrThrow({ orderBy: { id: 'asc' } }))
      .telefono_cifrado;
    await atacar('modificar-cifrado', { indice: 1 }).expect(201);
    const despues = (await prisma.persona.findFirstOrThrow({ orderBy: { id: 'asc' } }))
      .telefono_cifrado;
    expect(despues).not.toBe(antes);
    expect(despues).toHaveLength(antes.length);
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(fallas(r, 1)).toContain('hashDatos');
  });

  it('reescribir-cadena: los hashes cuadran, pero fallan la firma del usuario y el sello', async () => {
    await atacar('reescribir-cadena', { indice: 2 }).expect(201);
    const r = await verificar();
    for (const b of r.bloques) {
      expect(b.chequeos.hashDatos).toBe('ok');
      expect(b.chequeos.enlace).toBe('ok');
      expect(b.chequeos.hashCadena).toBe('ok');
      expect(b.chequeos.pow).toBe('ok');
    }
    expect(fallas(r, 2)).toEqual(['firmaUsuario']);
    expect(r.sello.estado).toBe('falla');
    expect(r.valida).toBe(false);
  });

  it('truncar: la cadena que queda es coherente pero el sello detecta el truncamiento', async () => {
    const antes = await prisma.bloque.count();
    await atacar('truncar').expect(201);
    expect(await prisma.bloque.count()).toBe(antes - 1);
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBeNull();
    expect(r.sello.motivos.join(' ')).toMatch(/Truncamiento/);
  });

  it('reordenar: intercambia dos bloques sin cambiar sus índices y falla el enlace', async () => {
    await atacar('reordenar', { indice: 1 }).expect(201);
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBe(1);
    expect(fallas(r, 1)).toContain('enlace');
  });

  it.each([
    ['cero', { indice: 0 }],
    ['fuera de rango', { indice: 99 }],
    ['no entero', { indice: 'x' }],
    ['decimal', { indice: 1.5 }],
    ['campo extra', { indice: 1, otro: true }],
  ])('400 con un índice %s y no toca la BD', async (_n, cuerpo) => {
    await atacar('modificar-dato', cuerpo).expect(400);
    expect((await verificar()).valida).toBe(true);
  });

  it('reordenar el último bloque da 400 (no hay siguiente)', async () => {
    await atacar('reordenar', { indice: 3 }).expect(400);
    expect((await verificar()).valida).toBe(true);
  });

  it('un ataque desconocido da 404', async () => {
    await atacar('no-existe').expect(404);
  });

  it('solo el admin: auditor y registrador 403, sin sesión 401', async () => {
    await http().get('/api/ataques').set('Cookie', auditor.cookie).expect(403);
    await atacar('modificar-dato', {}, auditor).expect(403);
    await atacar('modificar-dato', {}, ana).expect(403);
    await http().get('/api/ataques').expect(401);
    await http().post('/api/ataques/truncar').send({}).expect(401);
    expect((await verificar()).valida).toBe(true);
  });
});
