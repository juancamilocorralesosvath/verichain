import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ReporteCadena } from '@bc/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import {
  crearFirmante,
  crearPersonaFirmada,
  crearUsuario,
  type Firmante,
  type Sesion,
} from './ayudantes-firma.js';

describe('GET /api/cadena/verificar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firmante: Firmante;
  let auditor: Sesion;
  const http = () => ({
    get: (ruta: string) => request(app.getHttpServer()).get(ruta).set('Cookie', auditor.cookie),
  });
  const verificar = async (): Promise<ReporteCadena> =>
    (await http().get('/api/cadena/verificar').expect(200)).body as ReporteCadena;

  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    firmante = await crearFirmante(app, 'registrador');
    auditor = await crearUsuario(app, 'auditor', 'auditor');
  });
  afterAll(async () => {
    await app.close();
  });

  it('solo con el génesis: válida', async () => {
    const r = await verificar();
    expect(r.valida).toBe(true);
    expect(r.totalBloques).toBe(1);
  });

  it('cadena recién creada con 3 personas firmadas: válida y con el sello del servidor ok', async () => {
    for (let i = 0; i < 3; i++) expect((await crearPersonaFirmada(app, firmante)).status).toBe(201);
    const r = await verificar();
    expect(r.valida).toBe(true);
    expect(r.primerBloqueRoto).toBeNull();
    expect(r.totalBloques).toBe(4);
    expect(r.sello.estado).toBe('ok');
    for (const b of r.bloques) {
      expect(b.chequeos.hashDatos).toBe('ok');
      expect(b.chequeos.enlace).toBe('ok');
      expect(b.chequeos.hashCadena).toBe('ok');
      expect(b.chequeos.pow).toBe('ok');
      // la firma del usuario se verifica en todos los bloques menos en el génesis
      expect(b.chequeos.firmaUsuario).toBe(b.indice === 0 ? 'no-aplica' : 'ok');
    }
  });

  it('el reporte no expone campos internos de Prisma', async () => {
    const r = await verificar();
    expect(Object.keys(r).sort()).toEqual(
      ['bloques', 'primerBloqueRoto', 'sello', 'totalBloques', 'valida'].sort(),
    );
    for (const b of r.bloques) {
      expect(Object.keys(b).sort()).toEqual(['chequeos', 'indice', 'motivos']);
    }
    expect(JSON.stringify(r)).not.toMatch(/persona_id|"id"|cedula|nombre/);
  });

  it('modificar el nombre de una persona rompe su bloque', async () => {
    const bloque = await prisma.bloque.findUniqueOrThrow({ where: { indice: 2 } });
    await prisma.persona.update({
      where: { id: bloque.persona_id as number },
      data: { nombre: 'Intruso' },
    });
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBe(2);
    expect(r.bloques[2]?.chequeos.hashDatos).toBe('falla');
    expect(r.bloques[2]?.chequeos.hashCadena).toBe('falla');
    expect(r.bloques[2]?.motivos.join(' ')).toMatch(/datos de la persona/);
    expect(r.bloques[1]?.chequeos.hashDatos).toBe('ok');
  });

  it('una firma que no corresponde a la llave rompe firmaUsuario en ese bloque', async () => {
    const original = await prisma.bloque.findUniqueOrThrow({ where: { indice: 1 } });
    const ajena = (await prisma.bloque.findUniqueOrThrow({ where: { indice: 3 } })).firma_usuario;
    await prisma.bloque.update({ where: { indice: 1 }, data: { firma_usuario: ajena } });
    const r = await verificar();
    expect(r.bloques[1]?.chequeos.firmaUsuario).toBe('falla');
    expect(r.bloques[1]?.motivos.join(' ')).toMatch(/firma del usuario/);
    expect(r.primerBloqueRoto).toBe(1);
    await prisma.bloque.update({
      where: { indice: 1 },
      data: { firma_usuario: original.firma_usuario },
    });
  });

  it('modificar hash_anterior de un bloque rompe el enlace', async () => {
    await prisma.persona.update({
      where: {
        id: (await prisma.bloque.findUniqueOrThrow({ where: { indice: 2 } })).persona_id as number,
      },
      data: { nombre: 'Ana Pérez' }, // se restaura el dato del test anterior
    });
    expect((await verificar()).valida).toBe(true);

    await prisma.bloque.update({ where: { indice: 3 }, data: { hash_anterior: 'f'.repeat(64) } });
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBe(3);
    expect(r.bloques[3]?.chequeos.enlace).toBe('falla');
  });
});
