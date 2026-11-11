import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { calcularHashDatos, type ReporteCadena } from '@bc/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { CifradoService } from '../src/cripto/cifrado.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  crearFirmante,
  crearPersonaFirmada,
  crearUsuario,
  datosPersona,
  firmarConLlave,
  nuevoParEcdsa,
  type Firmante,
  type Sesion,
} from './ayudantes-firma.js';
import { crearBdTemporal } from './ayudantes-bd.js';

describe('Bloques firmados: preparar → firmar → confirmar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: Firmante;
  let luis: Firmante;
  let pendiente: Firmante;
  let auditor: Sesion;
  let admin: Sesion;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const preparar = (f: Sesion, cuerpo: Record<string, unknown> = datosPersona()): request.Test =>
    http().post('/api/bloques/preparar').set('Cookie', f.cookie).send(cuerpo);
  const confirmar = (f: Sesion, cuerpo: Record<string, unknown>): request.Test =>
    http().post('/api/bloques/confirmar').set('Cookie', f.cookie).send(cuerpo);
  const prepararOk = async (f: Sesion, cuerpo?: Record<string, unknown>) =>
    (await preparar(f, cuerpo).expect(201)).body as { borrador_id: string; hash_datos: string };

  beforeAll(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    ana = await crearFirmante(app, 'ana');
    luis = await crearFirmante(app, 'luis');
    pendiente = await crearFirmante(app, 'pendiente', 'pendiente');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    admin = await crearUsuario(app, 'admin1', 'admin');
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('flujo completo: la cadena verifica con firmaUsuario ok y los datos quedan cifrados', async () => {
    const datos = datosPersona({ direccion: 'Carrera 7 # 8-9', telefono: '3105550000' });
    const { borrador_id, hash_datos } = await prepararOk(ana, datos);
    expect(hash_datos).toMatch(/^[0-9a-f]{64}$/);
    const firma_b64 = ana.firmar(hash_datos);
    const res = await confirmar(ana, {
      borrador_id,
      llave_id: ana.llaveId,
      firma_b64,
    }).expect(201);
    expect(res.body).toMatchObject({ indice: 1, hash_datos });

    const persona = await prisma.persona.findUniqueOrThrow({
      where: { cedula: datos['cedula'] as string },
    });
    const bloque = await prisma.bloque.findUniqueOrThrow({ where: { persona_id: persona.id } });
    expect(persona.creado_por).toBe('ana');
    expect(persona.direccion_cifrada).not.toContain('Carrera 7');
    expect(new CifradoService(process.env['DATA_KEY']).descifrar(persona.direccion_cifrada)).toBe(
      'Carrera 7 # 8-9',
    );
    expect(bloque).toMatchObject({
      hash_datos,
      llave_id: ana.llaveId,
      firma_usuario: firma_b64,
    });
    expect(
      calcularHashDatos({
        cedula: persona.cedula,
        nombre: persona.nombre,
        direccion_cifrada: persona.direccion_cifrada,
        telefono_cifrado: persona.telefono_cifrado,
        creado_en: persona.creado_en,
        creado_por: persona.creado_por,
      }),
    ).toBe(hash_datos);
    expect(await prisma.borrador.findUnique({ where: { id: borrador_id } })).toBeNull();

    const reporte = (
      await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200)
    ).body as ReporteCadena;
    expect(reporte.valida).toBe(true);
    expect(reporte.bloques[1]?.chequeos.firmaUsuario).toBe('ok');
    expect(reporte.bloques[0]?.chequeos.firmaUsuario).toBe('no-aplica');
  });

  it('una firma hecha con otra llave da 400 y el borrador sigue sirviendo con la firma correcta', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    const ajena = firmarConLlave(nuevoParEcdsa().privada);
    const res = await confirmar(ana, {
      borrador_id,
      llave_id: ana.llaveId,
      firma_b64: ajena(hash_datos),
    }).expect(400);
    expect(res.body).toEqual({ statusCode: 400, mensaje: 'Firma inválida' });
    await confirmar(ana, {
      borrador_id,
      llave_id: ana.llaveId,
      firma_b64: ana.firmar(hash_datos),
    }).expect(201);
  });

  it('el borrador de otro usuario da 404', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    await confirmar(luis, {
      borrador_id,
      llave_id: luis.llaveId,
      firma_b64: luis.firmar(hash_datos),
    }).expect(404);
  });

  it('un borrador expirado da 410 y se elimina', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
    const res = await confirmar(ana, {
      borrador_id,
      llave_id: ana.llaveId,
      firma_b64: ana.firmar(hash_datos),
    }).expect(410);
    expect(res.body.statusCode).toBe(410);
    vi.useRealTimers();
    expect(await prisma.borrador.findUnique({ where: { id: borrador_id } })).toBeNull();
  });

  it('preparar limpia los borradores expirados', async () => {
    const { borrador_id } = await prepararOk(ana);
    vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
    await prepararOk(ana);
    vi.useRealTimers();
    expect(await prisma.borrador.findUnique({ where: { id: borrador_id } })).toBeNull();
  });

  it('una llave pendiente da 403', async () => {
    const { borrador_id, hash_datos } = await prepararOk(pendiente);
    await confirmar(pendiente, {
      borrador_id,
      llave_id: pendiente.llaveId,
      firma_b64: pendiente.firmar(hash_datos),
    }).expect(403);
  });

  it('la llave de otro usuario da 403', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    await confirmar(ana, {
      borrador_id,
      llave_id: luis.llaveId,
      firma_b64: luis.firmar(hash_datos),
    }).expect(403);
  });

  it('una llave inexistente da 403', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    await confirmar(ana, {
      borrador_id,
      llave_id: 999_999,
      firma_b64: ana.firmar(hash_datos),
    }).expect(403);
  });

  it('reutilizar un borrador ya confirmado da 404', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    const cuerpo = { borrador_id, llave_id: ana.llaveId, firma_b64: ana.firmar(hash_datos) };
    await confirmar(ana, cuerpo).expect(201);
    await confirmar(ana, cuerpo).expect(404);
  });

  it('dos confirmaciones simultáneas del mismo borrador: una gana y la otra da 404', async () => {
    const { borrador_id, hash_datos } = await prepararOk(ana);
    const cuerpo = { borrador_id, llave_id: ana.llaveId, firma_b64: ana.firmar(hash_datos) };
    const [a, b] = await Promise.all([confirmar(ana, cuerpo), confirmar(ana, cuerpo)]);
    expect([a.status, b.status].sort()).toEqual([201, 404]);
  });

  it('cédula repetida: 409 al preparar y 409 al confirmar si otro borrador ganó la carrera', async () => {
    const datos = datosPersona();
    const uno = await prepararOk(ana, datos);
    const dos = await prepararOk(luis, datos); // aún no existe: ambos borradores salen
    await confirmar(ana, {
      borrador_id: uno.borrador_id,
      llave_id: ana.llaveId,
      firma_b64: ana.firmar(uno.hash_datos),
    }).expect(201);
    const res = await confirmar(luis, {
      borrador_id: dos.borrador_id,
      llave_id: luis.llaveId,
      firma_b64: luis.firmar(dos.hash_datos),
    }).expect(409);
    expect(res.body).toEqual({ statusCode: 409, mensaje: 'Registro duplicado' });
    const repetida = await preparar(ana, datos).expect(409);
    expect(repetida.body).toEqual({ statusCode: 409, mensaje: 'Registro duplicado' });
  });

  it.each([
    ['cédula con letras', { cedula: '12ab56' }],
    ['teléfono con letras', { telefono: '300abc4567' }],
    ['nombre con dígitos', { nombre: 'Ana 2' }],
    ['dirección corta', { direccion: 'abc' }],
    ['campo extra', { admin: true }],
    ['tipo incorrecto', { cedula: 1234567 }],
  ])('preparar: 400 con %s', async (_n, extra) => {
    await preparar(ana, datosPersona(extra)).expect(400);
  });

  it.each([
    ['uuid inválido', { borrador_id: 'no-es-uuid' }],
    ['llave_id no entero', { llave_id: 'x' }],
    ['llave_id cero', { llave_id: 0 }],
    ['firma con caracteres inválidos', { firma_b64: 'no es base64!!' }],
    ['firma demasiado larga', { firma_b64: 'A'.repeat(500) }],
    ['campo extra', { rol: 'admin' }],
  ])('confirmar: 400 con %s', async (_n, cambio) => {
    const base = {
      borrador_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      llave_id: 1,
      firma_b64: 'AAAA',
    };
    await confirmar(ana, { ...base, ...cambio }).expect(400);
  });

  it('permisos: admin y auditor 403, sin sesión 401', async () => {
    for (const quien of [admin, auditor]) {
      await preparar(quien).expect(403);
      await confirmar(quien, {}).expect(403);
    }
    await http().post('/api/bloques/preparar').send(datosPersona()).expect(401);
    await http().post('/api/bloques/confirmar').send({}).expect(401);
  });

  it('POST /api/personas ya no existe', async () => {
    await http().post('/api/personas').set('Cookie', ana.cookie).send(datosPersona()).expect(404);
  });

  it('el ayudante crearPersonaFirmada recorre el flujo completo', async () => {
    const r = await crearPersonaFirmada(app, ana);
    expect(r.status).toBe(201);
  });
});
