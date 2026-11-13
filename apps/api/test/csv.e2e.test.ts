import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import { crearFirmante, type Firmante } from './ayudantes-firma.js';

describe('Carga CSV', () => {
  let app: INestApplication;
  let firmante: Firmante;
  beforeAll(async () => {
    crearBdTemporal();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    firmante = await crearFirmante(app, 'registradorcsv');
  });
  afterAll(async () => { await app?.close(); });

  it('rechaza encabezados incorrectos', async () => {
    await request(app.getHttpServer()).post('/api/bloques/preparar-lote').set('Cookie', firmante.cookie)
      .attach('archivo', Buffer.from('nombre,cedula\nAna,1234567'), { filename: 'personas.csv', contentType: 'text/csv' }).expect(400);
  });

  it('clasifica filas válidas e inválidas', async () => {
    const csv = 'cedula,nombre,direccion,telefono\n1234567,Ana Pérez,Calle 5 # 6-7,3001234567\n2345678,=HYPERLINK(x),Calle 5 # 6-7,3001234567';
    const res = await request(app.getHttpServer()).post('/api/bloques/preparar-lote').set('Cookie', firmante.cookie)
      .attach('archivo', Buffer.from(csv), { filename: 'personas.csv', contentType: 'text/csv' }).expect(201);
    expect(res.body.validas).toHaveLength(1);
    expect(res.body.invalidas).toHaveLength(1);
  });
});
