import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/configurar-app.js';

@Controller('ip')
class IpController {
  @Get()
  ip(@Req() req: { ip: string }) {
    return { ip: req.ip };
  }
}

let app: INestApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function crear(confiarEnProxy: boolean): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ controllers: [IpController] }).compile();
  app = modulo.createNestApplication();
  configurarApp(app, 'http://localhost:5173', { confiarEnProxy });
  await app.init();
  return app;
}

describe('trust proxy (detrás de nginx)', () => {
  it('activado: la IP es la de X-Forwarded-For (la real del cliente)', async () => {
    const a = await crear(true);
    const res = await request(a.getHttpServer())
      .get('/api/ip')
      .set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });

  it('desactivado (por defecto): X-Forwarded-For se ignora para no poder falsear la IP', async () => {
    const a = await crear(false);
    const res = await request(a.getHttpServer())
      .get('/api/ip')
      .set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).not.toBe('203.0.113.9');
  });
});
