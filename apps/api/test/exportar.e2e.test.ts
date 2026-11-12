import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  aOpcionesVerificacion,
  parsearExportacion,
  verificarCadena,
  type ReporteCadena,
} from '@bc/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { verificarFirmaNode } from '../src/cripto/verificador-firma.node.js';
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

const DIRECCIONES = ['Avenida Siempre Viva 742', 'Transversal 93 # 51-98', 'Diagonal 25G # 94-55'];
const TELEFONOS = ['3217654321', '3104448899', '3159990011'];

describe('GET /api/cadena/exportar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditor: Sesion;
  let admin: Sesion;
  let ana: Firmante;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const exportar = (quien: Sesion = auditor) =>
    http().get('/api/cadena/exportar').set('Cookie', quien.cookie);
  /** La llave del servidor "fijada" por quien verifica: la pública del archivo PEM del servidor. */
  const llaveFijada = (): string =>
    createPublicKey(
      createPrivateKey(readFileSync(process.env['SERVER_SIGNING_KEY_PATH'] as string)),
    )
      .export({ format: 'der', type: 'spki' })
      .toString('base64');

  beforeEach(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    admin = await crearUsuario(app, 'admin1', 'admin');
    ana = await crearFirmante(app, 'ana');
    for (let i = 0; i < 3; i++) {
      const r = await crearPersonaFirmada(
        app,
        ana,
        datosPersona({ direccion: DIRECCIONES[i], telefono: TELEFONOS[i] }),
      );
      expect(r.status).toBe(201);
    }
  });
  afterEach(async () => {
    await app?.close();
  });

  /** Verifica la exportación como lo haría un verificador externo: solo con core y la llave fijada. */
  async function verificarExportacion(texto: string): Promise<ReporteCadena> {
    const exp = parsearExportacion(JSON.parse(texto));
    return verificarCadena(
      exp.bloques,
      aOpcionesVerificacion(exp, {
        verificarFirma: verificarFirmaNode,
        llavePublicaServidor: llaveFijada(),
      }),
    );
  }

  it('exportar → parsear → verificar da el mismo resultado que GET /verificar', async () => {
    const res = await exportar().expect(200);
    const enServidor = (
      await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200)
    ).body as ReporteCadena;
    const local = await verificarExportacion(res.text);
    expect(local.valida).toBe(true);
    expect(local).toEqual(enServidor);
  });

  it('con la cadena truncada el verificador externo coincide con el servidor (falla por truncamiento)', async () => {
    const ultimo = await prisma.bloque.findFirstOrThrow({ orderBy: { indice: 'desc' } });
    await prisma.bloque.delete({ where: { indice: ultimo.indice } });
    await prisma.persona.delete({ where: { id: ultimo.persona_id as number } });
    const res = await exportar().expect(200);
    const enServidor = (
      await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200)
    ).body as ReporteCadena;
    const local = await verificarExportacion(res.text);
    expect(local.valida).toBe(false);
    expect(local.sello.motivos.join(' ')).toMatch(/Truncamiento/);
    expect(local).toEqual(enServidor);
  });

  it('el JSON no contiene ninguna dirección ni teléfono en claro', async () => {
    const res = await exportar().expect(200);
    for (const valor of [...DIRECCIONES, ...TELEFONOS, '+573001234567']) {
      expect(res.text).not.toContain(valor);
    }
    const exp = parsearExportacion(JSON.parse(res.text));
    expect(exp.bloques[1]?.persona?.direccion_cifrada).not.toContain('Avenida');
  });

  it('trae el formato, la dificultad, las llaves, el sello y la huella de la llave del servidor', async () => {
    const res = await exportar().expect(200);
    const exp = parsearExportacion(JSON.parse(res.text));
    expect(exp.formato).toBe('bc-export/1');
    expect(exp.dificultad).toBe(2);
    expect(exp.bloques).toHaveLength(4);
    expect(exp.bloques[0]?.persona).toBeNull();
    expect(exp.llaves_usuarios[String(ana.llaveId)]).toBe(ana.spki);
    expect(exp.sello?.indice).toBe(3);
    expect(exp.llave_servidor_spki_b64).toBe(llaveFijada());
    expect(exp.huella_llave_servidor).toBe(
      createHash('sha256').update(Buffer.from(llaveFijada(), 'base64')).digest('hex'),
    );
    expect(Number.isNaN(Date.parse(exp.exportado_en))).toBe(false);
  });

  it('se descarga como cadena-AAAAMMDD-HHmm.json', async () => {
    const res = await exportar().expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="cadena-\d{8}-\d{4}\.json"$/,
    );
  });

  it('las llaves reemplazadas siguen en la exportación (los bloques viejos siguen verificando)', async () => {
    await prisma.llaveUsuario.update({
      where: { id: ana.llaveId },
      data: { estado: 'reemplazada' },
    });
    const exp = parsearExportacion(JSON.parse((await exportar().expect(200)).text));
    expect(Object.keys(exp.llaves_usuarios)).toContain(String(ana.llaveId));
    await prisma.llaveUsuario.update({ where: { id: ana.llaveId }, data: { estado: 'pendiente' } });
    const sin = parsearExportacion(JSON.parse((await exportar().expect(200)).text));
    expect(Object.keys(sin.llaves_usuarios)).not.toContain(String(ana.llaveId));
  });

  it('permisos: admin y auditor sí; registrador 403; sin sesión 401', async () => {
    await exportar(admin).expect(200);
    await exportar(auditor).expect(200);
    await exportar(ana).expect(403);
    await http().get('/api/cadena/exportar').expect(401);
  });
});
