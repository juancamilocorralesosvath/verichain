import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularHashDatos } from '@bc/core';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PUBLICO } from '../src/auth/permisos.js';

describe('Matriz de permisos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const cookies: Record<string, string> = {};
  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    const password_hash = await hash('password-para-pruebas');
    for (const rol of ['admin', 'registrador', 'auditor']) {
      await prisma.usuario.create({ data: { username: `${rol}1`, rol, password_hash } });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `${rol}1`, password: 'password-para-pruebas' });
      cookies[rol] = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  const rutas = [
    { metodo: 'post', ruta: '/api/personas', codigos: [403, 201, 403, 401] },
    { metodo: 'get', ruta: '/api/personas', codigos: [403, 200, 200, 401] },
    { metodo: 'get', ruta: '/api/cadena', codigos: [200, 200, 200, 401] },
    { metodo: 'get', ruta: '/api/cadena/verificar', codigos: [200, 403, 200, 401] },
  ] as const;
  for (const { metodo, ruta, codigos } of rutas) {
    for (const [i, rol] of ['admin', 'registrador', 'auditor', 'sin sesión'].entries()) {
      it(`${metodo} ${ruta}: ${rol} → ${codigos[i]}`, async () => {
        const req = request(app.getHttpServer())[metodo](ruta);
        if (cookies[rol]) req.set('Cookie', cookies[rol]);
        if (metodo === 'post')
          req.send({
            cedula: '1234567',
            nombre: 'Ana Pérez',
            direccion: 'Calle 1 # 2-3',
            telefono: '3001234567',
          });
        await req.expect(codigos[i] as number);
      });
    }
  }
  it('asocia el creador a la fila y a su hash', async () => {
    const fila = await prisma.persona.findUniqueOrThrow({ where: { cedula: '1234567' } });
    const bloque = await prisma.bloque.findUniqueOrThrow({ where: { persona_id: fila.id } });
    expect(fila.creado_por).toBe('registrador1');
    const { cedula, nombre, direccion_cifrada, telefono_cifrado, creado_en, creado_por } = fila;
    expect(bloque.hash_datos).toBe(
      calcularHashDatos({
        cedula,
        nombre,
        direccion_cifrada,
        telefono_cifrado,
        creado_en,
        creado_por,
      }),
    );
  });
  it('toda ruta registrada exige sesión salvo las públicas explícitas', async () => {
    const rutas: string[] = [];
    for (const modulo of app.get(ModulesContainer).values()) {
      for (const wrapper of modulo.controllers.values()) {
        const clase = wrapper.metatype;
        if (!clase) continue;
        const base = Reflect.getMetadata(PATH_METADATA, clase) as string | undefined;
        if (base === undefined) continue;
        for (const nombre of Object.getOwnPropertyNames(clase.prototype as object)) {
          if (nombre === 'constructor') continue;
          const handler = (clase.prototype as Record<string, unknown>)[nombre];
          if (typeof handler !== 'function') continue;
          const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
          if (metodo === undefined) continue;
          const camino = Reflect.getMetadata(PATH_METADATA, handler) as string;
          const ruta = `/api/${base}/${camino}`.replace(/\/+$/, '');
          const publico = Boolean(
            Reflect.getMetadata(PUBLICO, handler) ?? Reflect.getMetadata(PUBLICO, clase),
          );
          rutas.push(`${RequestMethod[metodo]} ${ruta}${publico ? ' público' : ''}`);
          if (publico) continue;
          const req =
            metodo === RequestMethod.GET
              ? request(app.getHttpServer()).get(ruta)
              : request(app.getHttpServer()).post(ruta);
          await req.expect(401);
        }
      }
    }
    expect(rutas.filter((ruta) => ruta.endsWith(' público')).sort()).toEqual([
      'GET /api/salud público',
      'POST /api/auth/login público',
    ]);
    expect(rutas.length).toBeGreaterThanOrEqual(8);
  });
});
