import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HASH_CERO, calcularHashDatos, minar, type ReporteCadena } from '@bc/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  firmarConLlave,
  nuevoParEcdsa,
  type Firmante,
  type Sesion,
} from './ayudantes-firma.js';

const MENSAJE_COMPROMETIDA = 'Cadena comprometida: restaure antes de continuar';

describe('Sello del servidor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: Firmante;
  let auditor: Sesion;
  let escrito: string[];
  let escrituras: ReturnType<typeof vi.spyOn>[];
  const rutaLlave = (): string => process.env['SERVER_SIGNING_KEY_PATH'] as string;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const verificar = async (): Promise<ReporteCadena> =>
    (await http().get('/api/cadena/verificar').set('Cookie', auditor.cookie).expect(200))
      .body as ReporteCadena;
  const cantidadBloques = (): Promise<number> => prisma.bloque.count();

  beforeEach(async () => {
    // se captura lo que el proceso escribe a stdout/stderr para comprobar que la privada no se filtra
    escrito = [];
    escrituras = [process.stdout, process.stderr].map((flujo) =>
      vi.spyOn(flujo, 'write').mockImplementation(((trozo: unknown) => {
        escrito.push(String(trozo));
        return true;
      }) as never),
    );
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    ana = await crearFirmante(app, 'ana');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    for (let i = 0; i < 2; i++) expect((await crearPersonaFirmada(app, ana)).status).toBe(201);
  });
  afterEach(async () => {
    await app?.close();
    escrituras.forEach((e) => e.mockRestore());
  });

  /** Altera un dato y recalcula hash_datos, PoW y enlaces de todos los bloques desde `desde`. */
  async function recalcularDesde(desde: number): Promise<void> {
    const filas = await prisma.bloque.findMany({
      orderBy: { indice: 'asc' },
      include: { persona: true },
    });
    let anterior = filas[desde - 1]?.hash_cadena ?? HASH_CERO;
    for (const b of filas.filter((f) => f.indice >= desde)) {
      const hash_datos = b.persona
        ? calcularHashDatos({
            cedula: b.persona.cedula,
            nombre: b.persona.nombre,
            direccion_cifrada: b.persona.direccion_cifrada,
            telefono_cifrado: b.persona.telefono_cifrado,
            creado_en: b.persona.creado_en,
            creado_por: b.persona.creado_por,
          })
        : b.hash_datos;
      const minado = minar(anterior, hash_datos, 2);
      await prisma.bloque.update({
        where: { indice: b.indice },
        data: {
          hash_datos,
          hash_anterior: anterior,
          nonce: minado.nonce,
          hash_cadena: minado.hashCadena,
        },
      });
      anterior = minado.hashCadena;
    }
  }

  const intentarConfirmar = async () => {
    const preparar = await http()
      .post('/api/bloques/preparar')
      .set('Cookie', ana.cookie)
      .send(datosPersona())
      .expect(201);
    return http()
      .post('/api/bloques/confirmar')
      .set('Cookie', ana.cookie)
      .send({
        borrador_id: preparar.body.borrador_id,
        llave_id: ana.llaveId,
        firma_b64: ana.firmar(preparar.body.hash_datos),
      });
  };

  it('la cadena con sello verifica con sello ok, y hay un sello por bloque que verifica', async () => {
    const r = await verificar();
    expect(r.valida).toBe(true);
    expect(r.sello).toEqual({ estado: 'ok', motivos: [] });
    const sellos = await prisma.sello.findMany({ orderBy: { id: 'asc' } });
    expect(sellos.map((s) => s.indice)).toEqual([0, 1, 2]); // génesis + 2 anexos
    const bloques = await prisma.bloque.findMany({ orderBy: { indice: 'asc' } });
    const spki = createPublicKey(createPrivateKey(readFileSync(rutaLlave())))
      .export({ format: 'der', type: 'spki' })
      .toString('base64');
    for (const s of sellos) {
      expect(s.hash_cadena).toBe(bloques[s.indice]?.hash_cadena);
      expect(await verificarFirmaNode(spki, `${s.indice}:${s.hash_cadena}`, s.firma)).toBe(true);
    }
  });

  it('borrar el último bloque y su persona: los bloques siguen bien pero el sello detecta el truncamiento', async () => {
    const ultimo = await prisma.bloque.findFirstOrThrow({ orderBy: { indice: 'desc' } });
    await prisma.bloque.delete({ where: { indice: ultimo.indice } });
    await prisma.persona.delete({ where: { id: ultimo.persona_id as number } });
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBeNull(); // la cadena que queda es coherente: solo el sello la delata
    expect(r.sello.estado).toBe('falla');
    expect(r.sello.motivos.join(' ')).toMatch(/Truncamiento/);
  });

  it('alterar un dato y recalcular todos los hashes y el PoW: falla la firma del usuario y el sello', async () => {
    const bloque = await prisma.bloque.findUniqueOrThrow({ where: { indice: 1 } });
    await prisma.persona.update({
      where: { id: bloque.persona_id as number },
      data: { nombre: 'Intruso' },
    });
    await recalcularDesde(1);
    const r = await verificar();
    for (const b of r.bloques) {
      expect(b.chequeos.hashDatos).toBe('ok');
      expect(b.chequeos.enlace).toBe('ok');
      expect(b.chequeos.hashCadena).toBe('ok');
      expect(b.chequeos.pow).toBe('ok');
    }
    expect(r.bloques[1]?.chequeos.firmaUsuario).toBe('falla');
    expect(r.sello.estado).toBe('falla');
    expect(r.valida).toBe(false);
  });

  it('con la cadena alterada, confirmar da 409 y no se escribe nada', async () => {
    const bloque = await prisma.bloque.findUniqueOrThrow({ where: { indice: 1 } });
    await prisma.persona.update({
      where: { id: bloque.persona_id as number },
      data: { nombre: 'Intruso' },
    });
    const antes = await cantidadBloques();
    const sellosAntes = await prisma.sello.count();
    const res = await intentarConfirmar();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, mensaje: MENSAJE_COMPROMETIDA });
    expect(await cantidadBloques()).toBe(antes);
    expect(await prisma.sello.count()).toBe(sellosAntes);
    expect(await prisma.persona.count()).toBe(2);
    expect(await prisma.borrador.count()).toBe(1); // el borrador no se consumió
  });

  it('borrar solo el sello vigente deja uno viejo que no coincide con el último bloque', async () => {
    const vigente = await prisma.sello.findFirstOrThrow({ orderBy: { id: 'desc' } });
    await prisma.sello.delete({ where: { id: vigente.id } });
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.sello.estado).toBe('falla');
  });

  it('sin ningún sello la cadena no se da por íntegra y confirmar da 409', async () => {
    await prisma.sello.deleteMany();
    const r = await verificar();
    expect(r.valida).toBe(false);
    expect(r.sello.estado).toBe('falla');
    expect(r.sello.motivos.join(' ')).toMatch(/No existe ningún sello/);
    const res = await intentarConfirmar();
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toBe(MENSAJE_COMPROMETIDA);
  });

  it('un sello firmado con otra llave (forjado) falla', async () => {
    const ultimo = await prisma.sello.findFirstOrThrow({ orderBy: { id: 'desc' } });
    const forjada = firmarConLlave(nuevoParEcdsa().privada)(
      `${ultimo.indice}:${ultimo.hash_cadena}`,
    );
    await prisma.sello.update({ where: { id: ultimo.id }, data: { firma: forjada } });
    const r = await verificar();
    expect(r.sello.estado).toBe('falla');
    expect(r.sello.motivos.join(' ')).toMatch(/firma del sello/i);
    expect(r.valida).toBe(false);
  });

  it('una cadena intacta sigue aceptando anexos y sellando cada uno', async () => {
    expect((await intentarConfirmar()).status).toBe(201);
    expect(await prisma.sello.count()).toBe(4);
    expect((await verificar()).sello.estado).toBe('ok');
  });

  it('GET /api/cadena/llave-servidor es público y devuelve solo la pública y su huella', async () => {
    const res = await http().get('/api/cadena/llave-servidor').expect(200); // sin cookie
    expect(Object.keys(res.body).sort()).toEqual(['huella_sha256', 'pem']);
    expect(res.body.pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(res.body.pem).not.toMatch(/PRIVATE/);
    const der = createPublicKey(res.body.pem as string).export({ format: 'der', type: 'spki' });
    expect(res.body.huella_sha256).toBe(createHash('sha256').update(der).digest('hex'));
    const esperada = createPublicKey(createPrivateKey(readFileSync(rutaLlave()))).export({
      format: 'der',
      type: 'spki',
    });
    expect(der.equals(esperada)).toBe(true);
  });

  it('la llave privada no aparece en respuestas ni en lo escrito a stdout/stderr', async () => {
    const pemPrivada = readFileSync(rutaLlave(), 'utf8');
    const cuerpo = pemPrivada.replace(/-----[^-]+-----|\s/g, ''); // base64 de la privada
    const respuestas = [
      (await http().get('/api/cadena/llave-servidor')).text,
      (await http().get('/api/cadena').set('Cookie', auditor.cookie)).text,
      JSON.stringify(await verificar()),
      JSON.stringify((await intentarConfirmar()).body),
    ];
    await prisma.sello.deleteMany();
    respuestas.push((await intentarConfirmar()).text); // también el camino de error
    for (const texto of [...respuestas, ...escrito]) {
      expect(texto).not.toContain(cuerpo);
      expect(texto).not.toContain('PRIVATE KEY');
    }
  });
});
