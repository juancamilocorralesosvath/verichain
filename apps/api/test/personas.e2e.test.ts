import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashCadena,
  calcularHashDatos,
  cumpleDificultad,
  type FilaPersona,
  type ReporteCadena,
} from '@bc/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { CifradoService } from '../src/cripto/cifrado.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';
import {
  crearFirmante,
  crearPersonaFirmada,
  datosPersona,
  type Firmante,
} from './ayudantes-firma.js';

const DIFICULTAD = 2;

async function crearApp(): Promise<INestApplication> {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = ref.createNestApplication();
  configurarApp(app, 'http://localhost:5173');
  await app.init();
  return app;
}

interface BloqueApi {
  indice: number;
  persona_id: number | null;
  hash_datos: string;
  nonce: number;
  hash_anterior: string;
  hash_cadena: string;
}

describe('Génesis, personas y cadena (con bloques firmados)', () => {
  let app: INestApplication;
  let url: string;
  let firmante: Firmante;
  const http = (): ReturnType<typeof request.agent> =>
    request.agent(app.getHttpServer()).set('Cookie', firmante.cookie);
  const cadena = async (): Promise<BloqueApi[]> =>
    (await http().get('/api/cadena').expect(200)).body as BloqueApi[];
  const crear = (datos?: Record<string, unknown>) => crearPersonaFirmada(app, firmante, datos);

  beforeAll(async () => {
    url = crearBdTemporal();
    app = await crearApp();
    firmante = await crearFirmante(app, 'registrador1');
  });
  afterAll(async () => {
    await app.close();
  });

  it('al arrancar con la BD vacía existe exactamente el génesis, y reiniciar no lo duplica', async () => {
    const antes = await cadena();
    expect(antes).toHaveLength(1);
    expect(antes[0]).toMatchObject({
      indice: 0,
      persona_id: null,
      hash_datos: HASH_DATOS_GENESIS,
      hash_anterior: HASH_CERO,
    });
    expect(cumpleDificultad(antes[0]?.hash_cadena as string, DIFICULTAD)).toBe(true);

    await app.close();
    process.env['DATABASE_URL'] = url;
    app = await crearApp();
    expect(await cadena()).toHaveLength(1);
  });

  it('crear 3 personas produce 4 bloques enlazados, con PoW y firma verificable', async () => {
    for (let i = 0; i < 3; i++) expect((await crear()).status).toBe(201);
    const bloques = await cadena();
    expect(bloques.map((b) => b.indice)).toEqual([0, 1, 2, 3]);
    bloques.forEach((b, i) => {
      expect(cumpleDificultad(b.hash_cadena, DIFICULTAD)).toBe(true);
      expect(calcularHashCadena(b.hash_anterior, b.hash_datos, b.nonce)).toBe(b.hash_cadena);
      if (i > 0) expect(b.hash_anterior).toBe((bloques[i - 1] as BloqueApi).hash_cadena);
    });
    expect(bloques.slice(1).every((b) => b.persona_id !== null)).toBe(true);
    const reporte = (await http().get('/api/cadena/verificar').expect(403)).body; // el registrador no verifica
    expect(reporte.statusCode).toBe(403);
  });

  it('hash_datos guardado = calcularHashDatos de la fila leída de la BD', async () => {
    const res = await crear();
    expect(res.status).toBe(201);
    const prisma = app.get(PrismaService);
    const p = await prisma.persona.findUniqueOrThrow({
      where: { id: res.body['persona_id'] as number },
    });
    const b = await prisma.bloque.findUniqueOrThrow({ where: { persona_id: p.id } });
    const fila: FilaPersona = {
      cedula: p.cedula,
      nombre: p.nombre,
      direccion_cifrada: p.direccion_cifrada,
      telefono_cifrado: p.telefono_cifrado,
      creado_en: p.creado_en,
      creado_por: p.creado_por,
    };
    expect(b.hash_datos).toBe(calcularHashDatos(fila));
    expect(p.creado_por).toBe('registrador1');
    expect(p.direccion_cifrada).not.toContain('Calle 1 # 2-3');
    expect(p.telefono_cifrado).not.toContain('573001234567');
    const cifrado = new CifradoService(process.env['DATA_KEY']);
    expect(cifrado.descifrar(p.direccion_cifrada)).toBe('Calle 1 # 2-3');
    expect(cifrado.descifrar(p.telefono_cifrado)).toBe('+573001234567');
  });

  it.each([
    ['cédula con letras', { cedula: '12ab56' }],
    ['cédula corta', { cedula: '12345' }],
    ['cédula larga', { cedula: '12345678901' }],
    ['teléfono con letras', { telefono: '300abc4567' }],
    ['nombre con dígitos', { nombre: 'Ana 2' }],
    ['nombre muy corto', { nombre: 'A' }],
    ['dirección corta', { direccion: 'abc' }],
    ['campo extra', { admin: true }],
    ['tipo incorrecto', { cedula: 1234567 }],
  ])('400: %s', async (_nombre, extra) => {
    const antes = (await cadena()).length;
    expect((await crear(datosPersona(extra))).status).toBe(400);
    expect(await cadena()).toHaveLength(antes);
  });

  it('409 con cédula repetida, sin crear bloque ni filtrar detalles', async () => {
    const p = datosPersona();
    expect((await crear(p)).status).toBe(201);
    const antes = (await cadena()).length;
    const res = await crear(p);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, mensaje: 'Registro duplicado' });
    expect(await cadena()).toHaveLength(antes);
  });

  it('normaliza la entrada: trim y NFC', async () => {
    const nfd = 'José Núñez'; // José Núñez descompuesto
    const res = await crear(
      datosPersona({ nombre: `  ${nfd}  `, direccion: '  Carrera 5 # 6-7  ' }),
    );
    expect(res.status).toBe(201);
    const lista = (await http().get('/api/personas').expect(200)).body as Array<
      Record<string, unknown>
    >;
    const creada = lista.find((x) => x['id'] === res.body['persona_id']);
    expect(creada?.['nombre']).toBe('José Núñez'.normalize('NFC'));
    expect(
      new CifradoService(process.env['DATA_KEY']).descifrar(
        creada?.['direccion_cifrada'] as string,
      ),
    ).toBe('Carrera 5 # 6-7');
  });

  it('varias confirmaciones concurrentes no repiten índices ni rompen enlaces', async () => {
    const antes = (await cadena()).length;
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => crear()));
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    const bloques = await cadena();
    expect(bloques).toHaveLength(antes + 6);
    expect(new Set(bloques.map((b) => b.indice)).size).toBe(bloques.length);
    bloques.forEach((b, i) => {
      expect(b.indice).toBe(i);
      if (i > 0) expect(b.hash_anterior).toBe((bloques[i - 1] as BloqueApi).hash_cadena);
    });
  });

  it('GET /api/personas lista las personas creadas', async () => {
    const lista = (await http().get('/api/personas').expect(200)).body as unknown[];
    expect(lista.length).toBeGreaterThanOrEqual(3);
  });

  it('la cadena completa verifica (con un auditor)', async () => {
    const { crearUsuario } = await import('./ayudantes-firma.js');
    const auditor = await crearUsuario(app, 'auditor-final', 'auditor');
    const r = (
      await request(app.getHttpServer())
        .get('/api/cadena/verificar')
        .set('Cookie', auditor.cookie)
        .expect(200)
    ).body as ReporteCadena;
    expect(r.valida).toBe(true);
    expect(r.bloques.slice(1).every((b) => b.chequeos.firmaUsuario === 'ok')).toBe(true);
  });
});
