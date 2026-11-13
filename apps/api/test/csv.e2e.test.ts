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
  datosPersona,
  type Firmante,
  type Sesion,
} from './ayudantes-firma.js';

const ENCABEZADO = 'cedula,nombre,direccion,telefono';
const fila = (n: number, extra: Partial<Record<string, string>> = {}): string =>
  [
    extra['cedula'] ?? String(5_000_000 + n),
    extra['nombre'] ?? 'Persona Ejemplo',
    extra['direccion'] ?? `Calle ${n} # 10-20`,
    extra['telefono'] ?? `300123${String(1000 + n)}`,
  ].join(',');
const csv = (...filas: string[]): string => [ENCABEZADO, ...filas].join('\n');

interface Lote {
  validas: { fila: number; borrador_id: string; hash_datos: string }[];
  invalidas: { fila: number; errores: string[] }[];
}

describe('Carga masiva CSV (H7.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: Firmante;
  let auditor: Sesion;
  let admin: Sesion;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  const subir = (
    contenido: string | Buffer,
    opciones: { filename?: string; contentType?: string; cookie?: string } = {},
  ): request.Test =>
    http()
      .post('/api/bloques/preparar-lote')
      .set('Cookie', opciones.cookie ?? ana.cookie)
      .attach('archivo', Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido), {
        filename: opciones.filename ?? 'personas.csv',
        contentType: opciones.contentType ?? 'text/csv',
      });
  const confirmar = (cookie: string, items: unknown): request.Test =>
    http().post('/api/bloques/confirmar-lote').set('Cookie', cookie).send({ items });
  const firmarLote = (lote: Lote, firmante: Firmante = ana) =>
    lote.validas.map((v) => ({
      borrador_id: v.borrador_id,
      llave_id: firmante.llaveId,
      firma_b64: firmante.firmar(v.hash_datos),
    }));
  const bloques = async (): Promise<number> => prisma.bloque.count();
  const accionesBitacora = async (): Promise<string[]> => {
    const res = await http().get('/api/bitacora').set('Cookie', admin.cookie).expect(200);
    return (res.body as { entradas: { accion: string }[] }).entradas.map((e) => e.accion);
  };
  const cuenta = (lista: string[], accion: string): number =>
    lista.filter((a) => a === accion).length;

  beforeAll(async () => {
    crearBdTemporal();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    ana = await crearFirmante(app, 'registradorcsv');
    auditor = await crearUsuario(app, 'auditorcsv', 'auditor');
    admin = await crearUsuario(app, 'admincsv', 'admin');
  });
  afterAll(async () => {
    await app?.close();
  });

  describe('preparar-lote', () => {
    it('8 filas válidas y 2 inválidas → 8 borradores; confirmar el lote anexa 8 bloques y la cadena verifica', async () => {
      const filas = [
        ...Array.from({ length: 8 }, (_, i) => fila(i + 1)),
        fila(9, { cedula: 'abc' }),
        fila(10, { telefono: '12' }),
      ];
      const antes = await bloques();
      const res = await subir(csv(...filas)).expect(201);
      const lote = res.body as Lote;
      expect(lote.validas).toHaveLength(8);
      expect(lote.invalidas.map((i) => i.fila)).toEqual([10, 11]); // fila 1 = encabezado
      for (const v of lote.validas) expect(v.hash_datos).toMatch(/^[0-9a-f]{64}$/);
      expect(await prisma.borrador.count()).toBeGreaterThanOrEqual(8);
      expect(await bloques()).toBe(antes); // preparar no anexa nada

      const conf = await confirmar(ana.cookie, firmarLote(lote)).expect(201);
      expect((conf.body as { anexadas: number[]; error: string | null }).anexadas).toHaveLength(8);
      expect((conf.body as { error: string | null }).error).toBeNull();
      expect(await bloques()).toBe(antes + 8);

      const reporte = (
        await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200)
      ).body as ReporteCadena;
      expect(reporte.valida).toBe(true);
    });

    it('una celda =HYPERLINK(...) como nombre se rechaza por la regex del nombre y no genera borrador', async () => {
      const antes = await prisma.borrador.count();
      const res = await subir(csv(fila(20, { nombre: '=HYPERLINK(http://x)' }))).expect(201);
      const lote = res.body as Lote;
      expect(lote.validas).toHaveLength(0);
      expect(lote.invalidas[0]?.errores.join(' ')).toMatch(/nombre/i);
      expect(await prisma.borrador.count()).toBe(antes);
    });

    it('cédula duplicada dentro del archivo y contra la BD', async () => {
      await crearPersonaFirmada(app, ana, datosPersona({ cedula: '6000001' }));
      const res = await subir(
        csv(
          fila(30, { cedula: '6000002' }),
          fila(31, { cedula: '6000002' }), // repetida en el archivo
          fila(32, { cedula: '6000001' }), // ya existe en la BD
        ),
      ).expect(201);
      const lote = res.body as Lote;
      expect(lote.validas.map((v) => v.fila)).toEqual([2]);
      expect(lote.invalidas.map((i) => i.fila)).toEqual([3, 4]);
      for (const i of lote.invalidas) expect(i.errores.join(' ')).toMatch(/duplicad/i);
    });

    it('trata las comas dentro de comillas como parte de la celda (parser real, no split)', async () => {
      const res = await subir(csv('5100001,Ana Pérez,"Calle 1, Apto 2 # 3-4",3001234567')).expect(
        201,
      );
      expect((res.body as Lote).validas).toHaveLength(1);
      expect((res.body as Lote).invalidas).toHaveLength(0);
    });

    it('número de columnas incorrecto → fila inválida', async () => {
      const res = await subir(csv('5200001,Solo Nombre')).expect(201);
      expect((res.body as Lote).invalidas).toHaveLength(1);
    });

    it('encabezado incorrecto → 400', async () => {
      await subir('nombre,cedula\nAna,1234567').expect(400);
      await subir('cedula,nombre,direccion,telefono,extra\n1,2,3,4,5').expect(400);
    });

    it('un archivo de 300 KB se rechaza (413)', async () => {
      const grande = Buffer.alloc(300 * 1024, 'a');
      await subir(grande).expect(413);
    });

    it('más de 500 filas → 400', async () => {
      const filas = Array.from({ length: 501 }, (_, i) =>
        fila(i + 1, { cedula: String(7_000_000 + i) }),
      );
      await subir(csv(...filas)).expect(400);
    });

    it('una celda enorme → 400', async () => {
      await subir(csv(fila(1, { direccion: 'x'.repeat(10_000) }))).expect(400);
    });

    it('un archivo que no es CSV (extensión o tipo) → 400', async () => {
      await subir(csv(fila(1)), { filename: 'personas.txt', contentType: 'text/plain' }).expect(
        400,
      );
      await subir(csv(fila(1)), { filename: 'personas.csv', contentType: 'image/png' }).expect(400);
      await http().post('/api/bloques/preparar-lote').set('Cookie', ana.cookie).expect(400); // sin archivo
    });

    it('solo el registrador: auditor/admin → 403 y sin sesión → 401', async () => {
      await subir(csv(fila(1)), { cookie: auditor.cookie }).expect(403);
      await subir(csv(fila(1)), { cookie: admin.cookie }).expect(403);
      await http()
        .post('/api/bloques/preparar-lote')
        .attach('archivo', Buffer.from(csv(fila(1))), {
          filename: 'a.csv',
          contentType: 'text/csv',
        })
        .expect(401);
    });
  });

  describe('confirmar-lote', () => {
    it('falla a mitad de lote: se detiene, reporta las anexadas y no anexa el resto', async () => {
      const lote = (await subir(csv(fila(40), fila(41), fila(42), fila(43))).expect(201))
        .body as Lote;
      const items = firmarLote(lote);
      items[2] = { ...items[2]!, firma_b64: ana.firmar('f'.repeat(64)) }; // firma de otro mensaje
      const antes = await bloques();
      const res = await confirmar(ana.cookie, items).expect(201);
      const cuerpo = res.body as { anexadas: number[]; error: string | null };
      expect(cuerpo.anexadas).toHaveLength(2);
      expect(cuerpo.error).toMatch(/firma/i);
      expect(await bloques()).toBe(antes + 2);
      // la cadena sigue íntegra con el lote parcial
      const reporte = (await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie))
        .body;
      expect((reporte as ReporteCadena).valida).toBe(true);
    });

    it('un borrador de otro usuario se trata como inexistente', async () => {
      const luis = await crearFirmante(app, 'registradorcsv2');
      const lote = (await subir(csv(fila(50))).expect(201)).body as Lote;
      const antes = await bloques();
      const res = await confirmar(luis.cookie, firmarLote(lote, luis)).expect(201);
      expect((res.body as { anexadas: number[] }).anexadas).toHaveLength(0);
      expect(await bloques()).toBe(antes);
    });

    it('valida el cuerpo: sin items, vacío, demasiados o mal formados → 400', async () => {
      await http()
        .post('/api/bloques/confirmar-lote')
        .set('Cookie', ana.cookie)
        .send({})
        .expect(400);
      await confirmar(ana.cookie, []).expect(400);
      await confirmar(ana.cookie, [{ borrador_id: 'no-uuid', llave_id: 1, firma_b64: 'x' }]).expect(
        400,
      );
      const muchos = Array.from({ length: 501 }, () => ({
        borrador_id: '00000000-0000-4000-8000-000000000000',
        llave_id: 1,
        firma_b64: 'AAAA',
      }));
      await confirmar(ana.cookie, muchos).expect(400);
    });

    it('solo el registrador puede confirmar un lote', async () => {
      await confirmar(auditor.cookie, []).expect(403);
    });
  });

  describe('bitácora', () => {
    it('registra UNA entrada por lote (no una por fila) y nada de datos personales', async () => {
      const antes = await accionesBitacora();
      const lote = (await subir(csv(fila(60), fila(61), fila(62))).expect(201)).body as Lote;
      await confirmar(ana.cookie, firmarLote(lote)).expect(201);
      const despues = await accionesBitacora();
      expect(cuenta(despues, 'preparar_lote') - cuenta(antes, 'preparar_lote')).toBe(1);
      expect(cuenta(despues, 'csv') - cuenta(antes, 'csv')).toBe(1);
      expect(cuenta(despues, 'preparar_bloque')).toBe(cuenta(antes, 'preparar_bloque'));
      expect(cuenta(despues, 'crear_bloque')).toBe(cuenta(antes, 'crear_bloque'));
      const texto = JSON.stringify(
        (await http().get('/api/bitacora').set('Cookie', admin.cookie)).body,
      );
      expect(texto).not.toContain('Persona Ejemplo');
      expect(texto).not.toContain('Calle 60');
    });
  });

  // Debe ir al final: deja la cadena comprometida a propósito.
  describe('cadena comprometida', () => {
    it('no anexa nada: la verificación del inicio del lote falla y el error lo dice', async () => {
      const lote = (await subir(csv(fila(70), fila(71))).expect(201)).body as Lote;
      const ultimo = await prisma.bloque.findFirstOrThrow({ orderBy: { indice: 'desc' } });
      await prisma.bloque.delete({ where: { indice: ultimo.indice } }); // truncamiento
      const antes = await bloques();
      const res = await confirmar(ana.cookie, firmarLote(lote)).expect(201);
      const cuerpo = res.body as { anexadas: number[]; error: string | null };
      expect(cuerpo.anexadas).toHaveLength(0);
      expect(cuerpo.error).toMatch(/comprometida/i);
      expect(await bloques()).toBe(antes);
    });
  });
});
