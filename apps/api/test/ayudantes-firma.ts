import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { hash } from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CLAVE = 'clave-de-prueba-123';
let seq = 0;

/** Datos válidos de una persona, con cédula única. */
export const datosPersona = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  cedula: String(3_000_000 + ++seq),
  nombre: 'Ana Pérez',
  direccion: 'Calle 1 # 2-3',
  telefono: '+573001234567',
  ...extra,
});

export interface Sesion {
  id: number;
  username: string;
  cookie: string;
}

export interface Firmante extends Sesion {
  llaveId: number;
  spki: string;
  privada: KeyObject;
  /** Firma ECDSA P-256 IEEE-P1363 (base64) sobre los bytes del string hex `hash_datos`. */
  firmar: (hashDatos: string) => string;
}

export async function crearUsuario(
  app: INestApplication,
  username: string,
  rol: string,
): Promise<Sesion> {
  const prisma = app.get(PrismaService);
  const usuario = await prisma.usuario.create({
    data: { username, rol, password_hash: await hash(CLAVE) },
  });
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: CLAVE })
    .expect(201);
  const cookie = (login.headers['set-cookie'] as unknown as string[])[0] ?? '';
  return { id: usuario.id, username, cookie };
}

export const nuevoParEcdsa = (): { privada: KeyObject; spki: string } => {
  const par = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    privada: par.privateKey,
    spki: par.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
};

export const firmarConLlave =
  (privada: KeyObject) =>
  (hashDatos: string): string =>
    sign('sha256', Buffer.from(hashDatos, 'ascii'), {
      key: privada,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64');

/** Registrador con una llave propia (por defecto ya aprobada), generada en el test. */
export async function crearFirmante(
  app: INestApplication,
  username: string,
  estado: 'aprobada' | 'pendiente' = 'aprobada',
): Promise<Firmante> {
  const sesion = await crearUsuario(app, username, 'registrador');
  const { privada, spki } = nuevoParEcdsa();
  const llave = await app.get(PrismaService).llaveUsuario.create({
    data: { usuario_id: sesion.id, version: 1, spki_b64: spki, estado },
  });
  return { ...sesion, llaveId: llave.id, spki, privada, firmar: firmarConLlave(privada) };
}

export interface Resultado {
  status: number;
  body: Record<string, unknown>;
  borrador_id?: string;
}

/** Flujo completo preparar → firmar → confirmar. `status` es el de la última fase que corrió. */
export async function crearPersonaFirmada(
  app: INestApplication,
  firmante: Firmante,
  datos: Record<string, unknown> = datosPersona(),
): Promise<Resultado> {
  const http = request(app.getHttpServer());
  const preparar = await http
    .post('/api/bloques/preparar')
    .set('Cookie', firmante.cookie)
    .send(datos);
  if (preparar.status !== 201) return { status: preparar.status, body: preparar.body };
  const { borrador_id, hash_datos } = preparar.body as { borrador_id: string; hash_datos: string };
  const confirmar = await request(app.getHttpServer())
    .post('/api/bloques/confirmar')
    .set('Cookie', firmante.cookie)
    .send({ borrador_id, llave_id: firmante.llaveId, firma_b64: firmante.firmar(hash_datos) });
  return { status: confirmar.status, body: confirmar.body, borrador_id };
}
