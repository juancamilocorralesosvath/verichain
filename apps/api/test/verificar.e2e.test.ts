import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ReporteCadena } from '@bc/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';

let seq = 0;
const persona = (): Record<string, string> => ({
  cedula: String(2_000_000 + ++seq),
  nombre: 'Ana Pérez',
  direccion: 'Calle 1 # 2-3',
  telefono: '3001234567',
});

describe('GET /api/cadena/verificar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const verificar = async (): Promise<ReporteCadena> =>
    (await http().get('/api/cadena/verificar').expect(200)).body as ReporteCadena;

  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('solo con el génesis: válida', async () => {
    const r = await verificar();
    expect(r.valida).toBe(true);
    expect(r.totalBloques).toBe(1);
  });

  it('cadena recién creada con 3 personas: válida, firmas y sello no aplican', async () => {
    for (let i = 0; i < 3; i++) await http().post('/api/personas').send(persona()).expect(201);
    const r = await verificar();
    expect(r.valida).toBe(true);
    expect(r.primerBloqueRoto).toBeNull();
    expect(r.totalBloques).toBe(4);
    expect(r.sello.estado).toBe('no-aplica');
    for (const b of r.bloques) {
      expect(b.chequeos.hashDatos).toBe('ok');
      expect(b.chequeos.enlace).toBe('ok');
      expect(b.chequeos.hashCadena).toBe('ok');
      expect(b.chequeos.pow).toBe('ok');
      expect(b.chequeos.firmaUsuario).toBe('no-aplica');
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
