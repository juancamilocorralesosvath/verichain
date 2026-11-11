import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CORE_VERSION } from '@bc/core';
import { IsString } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import { Publico } from '../src/auth/permisos.js';

const WEB_ORIGIN = 'http://localhost:5173';

class DtoPrueba {
  @IsString()
  nombre!: string;
}

@Controller('prueba')
@Publico()
class PruebaController {
  @Post('dto')
  dto(@Body() body: DtoPrueba): DtoPrueba {
    return body;
  }
  @Get('error')
  error(): never {
    throw new Error('secreto-interno-no-debe-salir');
  }
}

@Module({
  imports: [AppModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
  controllers: [PruebaController],
})
class ModuloPrueba {}

// Módulo aparte con un límite bajo para probar el throttler.
@Controller('limitado')
class LimitadoController {
  @Get()
  ok(): { ok: boolean } {
    return { ok: true };
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [LimitadoController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ModuloLimitado {}

async function crearApp(modulo: new () => object): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [modulo] }).compile();
  const app = moduleRef.createNestApplication();
  configurarApp(app, WEB_ORIGIN);
  await app.init();
  return app;
}

describe('API base', () => {
  let app: INestApplication;
  beforeAll(async () => {
    crearBdTemporal();
    app = await crearApp(ModuloPrueba);
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/salud responde 200 con coreVersion de @bc/core', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud').expect(200);
    expect(res.body).toEqual({ ok: true, coreVersion: CORE_VERSION });
  });

  it('incluye las cabeceras de helmet', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('un body válido pasa el DTO', async () => {
    await request(app.getHttpServer()).post('/api/prueba/dto').send({ nombre: 'Ana' }).expect(201);
  });

  it('un campo extra en el body da 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/prueba/dto')
      .send({ nombre: 'Ana', admin: true })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.stack).toBeUndefined();
  });

  it('una excepción no controlada responde genérico, sin stack ni detalle', async () => {
    const res = await request(app.getHttpServer()).get('/api/prueba/error').expect(500);
    expect(res.body).toEqual({ statusCode: 500, mensaje: 'Error interno del servidor' });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|secreto-interno/);
  });

  it('una ruta inexistente da 404 sin traza', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(res.body.statusCode).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('CORS: solo el origen del frontend, con credenciales', async () => {
    const ok = await request(app.getHttpServer()).get('/api/salud').set('Origin', WEB_ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const otro = await request(app.getHttpServer())
      .get('/api/salud')
      .set('Origin', 'http://malo.example');
    expect(otro.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Throttler', () => {
  it('devuelve 429 al superar el límite', async () => {
    const app = await crearApp(ModuloLimitado);
    const http = request(app.getHttpServer());
    await http.get('/api/limitado').expect(200);
    await http.get('/api/limitado').expect(200);
    await http.get('/api/limitado').expect(429);
    await app.close();
  });
});
