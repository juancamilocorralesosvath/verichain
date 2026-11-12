import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HASH_CERO, hashEntradaBitacora } from '@bc/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { BitacoraService } from '../src/bitacora/bitacora.service.js';
import { configurarApp } from '../src/configurar-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBdTemporal } from './ayudantes-bd.js';
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

interface EntradaApi {
  id?: number;
  fecha: string;
  usuario: string;
  accion: string;
  resultado: string;
  ip: string;
  detalle: string;
  hash: string;
}
interface RespuestaBitacora {
  entradas: EntradaApi[];
  pagina: number;
  totalPaginas: number;
  total: number;
  verificacion: { valida: boolean; primeraRota: number | null };
}

const CLAVE_MAL = 'contraseña-incorrecta-xyz-987';

describe('Bitácora de auditoría', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Sesion;
  let auditor: Sesion;
  let ana: Firmante;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const leer = async (pagina?: number, quien: Sesion = auditor): Promise<RespuestaBitacora> =>
    (
      await http()
        .get('/api/bitacora' + (pagina ? `?pagina=${pagina}` : ''))
        .set('Cookie', quien.cookie)
        .expect(200)
    ).body as RespuestaBitacora;
  const acciones = async (): Promise<string[]> =>
    (await leer()).entradas.map((e) => e.accion).reverse(); // de la más antigua a la más reciente

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
  });
  afterEach(async () => {
    await app?.close();
  });

  it('un login fallido y uno exitoso dejan 2 entradas con el resultado correcto, sin la contraseña', async () => {
    const antes = (await leer()).total;
    await http().post('/api/auth/login').send({ username: 'ana', password: CLAVE_MAL }).expect(401);
    await http()
      .post('/api/auth/login')
      .send({ username: 'ana', password: 'clave-de-prueba-123' })
      .expect(201);
    const r = await leer();
    expect(r.total).toBe(antes + 2);
    const [ok, fallo] = r.entradas; // la más reciente primero
    expect(fallo).toMatchObject({ accion: 'login_fallido', resultado: 'fallo', usuario: '-' });
    expect(ok).toMatchObject({ accion: 'login', resultado: 'ok', usuario: 'ana' });
    const todo = JSON.stringify(await prisma.bitacora.findMany()) + JSON.stringify(r);
    expect(todo).not.toContain(CLAVE_MAL);
    expect(todo).not.toContain('clave-de-prueba-123');
  });

  it('cada entrada trae fecha ISO, IP y un hash que encadena con la anterior', async () => {
    await http().post('/api/auth/login').send({ username: 'ana', password: CLAVE_MAL }).expect(401);
    const filas = await prisma.bitacora.findMany({ orderBy: { id: 'asc' } });
    let anterior = HASH_CERO;
    for (const f of filas) {
      expect(Number.isNaN(Date.parse(f.fecha))).toBe(false);
      expect(f.ip).toBeTruthy();
      expect(f.hash).toBe(
        hashEntradaBitacora(anterior, {
          fecha: f.fecha,
          usuario: f.usuario,
          accion: f.accion,
          resultado: f.resultado,
          ip: f.ip,
          detalle: f.detalle,
        }),
      );
      anterior = f.hash;
    }
    expect((await leer()).verificacion).toEqual({ valida: true, primeraRota: null });
  });

  it('registra preparar, crear bloque, verificar y exportar con el usuario y sin datos personales', async () => {
    const datos = datosPersona({ direccion: 'Avenida Siempre Viva 742', telefono: '3217654321' });
    expect((await crearPersonaFirmada(app, ana, datos)).status).toBe(201);
    await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200);
    await http().get('/api/cadena/exportar').set('Cookie', admin.cookie).expect(200);
    const lista = await acciones();
    for (const a of ['preparar_bloque', 'crear_bloque', 'verificar', 'exportar'])
      expect(lista).toContain(a);
    const crear = (await leer()).entradas.find((e) => e.accion === 'crear_bloque');
    expect(crear).toMatchObject({ usuario: 'ana', resultado: 'ok', detalle: 'bloque 1' });
    const texto = JSON.stringify(await leer());
    for (const secreto of ['Avenida Siempre Viva', '3217654321', datos['cedula'] as string]) {
      expect(texto).not.toContain(secreto);
    }
  });

  it('una firma inválida al confirmar queda registrada como fallo', async () => {
    const p = await http()
      .post('/api/bloques/preparar')
      .set('Cookie', ana.cookie)
      .send(datosPersona())
      .expect(201);
    await http()
      .post('/api/bloques/confirmar')
      .set('Cookie', ana.cookie)
      .send({
        borrador_id: p.body.borrador_id,
        llave_id: ana.llaveId,
        firma_b64: firmarConLlave(nuevoParEcdsa().privada)(p.body.hash_datos),
      })
      .expect(400);
    const e = (await leer()).entradas.find((x) => x.accion === 'crear_bloque');
    expect(e).toMatchObject({ usuario: 'ana', resultado: 'fallo' });
    expect(e?.detalle).toMatch(/firma inválida/i);
  });

  it('registra el alta, la aprobación y el rechazo de llaves', async () => {
    const reg = await http()
      .post('/api/llaves')
      .set('Cookie', ana.cookie)
      .send({ spki_b64: nuevoParEcdsa().spki })
      .expect(201);
    await http().post(`/api/llaves/${reg.body.id}/aprobar`).set('Cookie', admin.cookie).expect(200);
    const otra = await http()
      .post('/api/llaves')
      .set('Cookie', ana.cookie)
      .send({ spki_b64: nuevoParEcdsa().spki })
      .expect(201);
    await http()
      .post(`/api/llaves/${otra.body.id}/rechazar`)
      .set('Cookie', admin.cookie)
      .expect(200);
    const entradas = (await leer()).entradas;
    expect(entradas.find((e) => e.accion === 'llave_registrar')?.usuario).toBe('ana');
    expect(entradas.find((e) => e.accion === 'llave_aprobar')?.usuario).toBe('admin1');
    expect(entradas.find((e) => e.accion === 'llave_rechazar')?.usuario).toBe('admin1');
  });

  it('permisos: admin y auditor sí; registrador 403; sin sesión 401', async () => {
    await leer(undefined, admin);
    await leer(undefined, auditor);
    await http().get('/api/bitacora').set('Cookie', ana.cookie).expect(403);
    await http().get('/api/bitacora').expect(401);
  });

  it('alterar el detalle de una entrada o borrar una del medio invalida la bitácora con la posición', async () => {
    for (let i = 0; i < 4; i++)
      await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie);
    const filas = await prisma.bitacora.findMany({ orderBy: { id: 'asc' } });
    const k = 3;
    await prisma.bitacora.update({
      where: { id: filas[k]?.id as number },
      data: { detalle: 'alterado' },
    });
    expect((await leer()).verificacion).toEqual({ valida: false, primeraRota: k });
    await prisma.bitacora.update({
      where: { id: filas[k]?.id as number },
      data: { detalle: filas[k]?.detalle as string },
    });
    expect((await leer()).verificacion.valida).toBe(true);
    await prisma.bitacora.delete({ where: { id: filas[k]?.id as number } });
    expect((await leer()).verificacion).toEqual({ valida: false, primeraRota: k });
  });

  it('pagina de 50 en 50, con las más recientes primero, y verifica toda la cadena', async () => {
    const servicio = app.get(BitacoraService);
    for (let i = 0; i < 120; i++) {
      await servicio.registrar({
        usuario: 'prueba',
        accion: 'ejemplo',
        resultado: 'ok',
        ip: '127.0.0.1',
        detalle: `n ${i}`,
      });
    }
    const p1 = await leer(1);
    expect(p1.entradas).toHaveLength(50);
    expect(p1.pagina).toBe(1);
    expect(p1.total).toBeGreaterThanOrEqual(120);
    expect(p1.totalPaginas).toBe(Math.ceil(p1.total / 50));
    expect(p1.entradas[0]?.detalle).toBe('n 119');
    expect(p1.verificacion.valida).toBe(true);
    const ultima = await leer(p1.totalPaginas);
    expect(ultima.entradas.length).toBe(p1.total - 50 * (p1.totalPaginas - 1));
    expect((await leer(p1.totalPaginas + 5)).entradas).toEqual([]);
  });

  it('pagina inválida da 400', async () => {
    await http().get('/api/bitacora?pagina=0').set('Cookie', auditor.cookie).expect(400);
    await http().get('/api/bitacora?pagina=abc').set('Cookie', auditor.cookie).expect(400);
  });

  it('limpia y acota los campos antes de guardarlos (sin saltos de línea ni textos enormes)', async () => {
    await app.get(BitacoraService).registrar({
      usuario: 'x\ny',
      accion: 'prueba',
      resultado: 'ok',
      ip: '1.2.3.4',
      detalle: 'a\nb' + 'z'.repeat(500),
    });
    const e = (await leer()).entradas[0] as EntradaApi;
    expect(e.usuario).toBe('x y');
    expect(e.detalle).not.toContain('\n');
    expect(e.detalle.length).toBeLessThanOrEqual(200);
  });
});
