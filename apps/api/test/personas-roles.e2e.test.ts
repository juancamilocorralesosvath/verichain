import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { CifradoService } from '../src/cripto/cifrado.service.js';
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

type Fila = Record<string, unknown>;
const PERSONAS = [
  { direccion: 'Avenida Siempre Viva 742', telefono: '3217654321' },
  { direccion: 'Transversal 93 # 51-98', telefono: '3104448899' },
];

describe('GET /api/personas según el rol (H4.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: Firmante;
  let auditor: Sesion;
  let admin: Sesion;
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const listar = async (quien: Sesion): Promise<Fila[]> =>
    (await http().get('/api/personas').set('Cookie', quien.cookie).expect(200)).body as Fila[];
  /** Cambia un carácter del texto cifrado, como lo haría un atacante con acceso a la BD. */
  const corromper = async (
    id: number,
    campo: 'telefono_cifrado' | 'direccion_cifrada',
  ): Promise<void> => {
    const fila = await prisma.persona.findUniqueOrThrow({ where: { id } });
    const texto = fila[campo];
    await prisma.persona.update({
      where: { id },
      data: { [campo]: texto.slice(0, 20) + (texto[20] === 'A' ? 'B' : 'A') + texto.slice(21) },
    });
  };

  beforeEach(async () => {
    crearBdTemporal();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    configurarApp(app, 'http://localhost:5173');
    await app.init();
    prisma = app.get(PrismaService);
    ana = await crearFirmante(app, 'ana');
    auditor = await crearUsuario(app, 'auditor1', 'auditor');
    admin = await crearUsuario(app, 'admin1', 'admin');
    for (const p of PERSONAS) {
      expect((await crearPersonaFirmada(app, ana, datosPersona(p))).status).toBe(201);
    }
  });
  afterEach(async () => {
    await app?.close();
  });

  it('el registrador ve los datos descifrados, con la forma exacta del diseño', async () => {
    const lista = await listar(ana);
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({
      nombre: 'Ana Pérez',
      direccion: PERSONAS[0]?.direccion,
      telefono: PERSONAS[0]?.telefono,
      creado_por: 'ana',
      integra: true,
    });
    expect(lista[1]?.['telefono']).toBe(PERSONAS[1]?.telefono);
    for (const fila of lista) {
      expect(Object.keys(fila).sort()).toEqual([
        'cedula',
        'creado_en',
        'creado_por',
        'direccion',
        'id',
        'integra',
        'nombre',
        'telefono',
      ]);
    }
  });

  it('el auditor ve *** y el texto cifrado, nunca los datos reales', async () => {
    const lista = await listar(auditor);
    const cifrado = new CifradoService(process.env['DATA_KEY']);
    for (const [i, fila] of lista.entries()) {
      expect(Object.keys(fila).sort()).toEqual([
        'cedula',
        'creado_en',
        'creado_por',
        'direccion',
        'direccion_cifrada',
        'id',
        'integra',
        'nombre',
        'telefono',
        'telefono_cifrado',
      ]);
      expect(fila['direccion']).toBe('***');
      expect(fila['telefono']).toBe('***');
      expect(fila['integra']).toBe(true);
      // el texto cifrado es el del servidor (base64 iv‖tag‖ciphertext) y descifra al dato original
      expect(cifrado.descifrar(fila['telefono_cifrado'] as string)).toBe(PERSONAS[i]?.telefono);
      expect(fila['telefono_cifrado']).not.toContain(PERSONAS[i]?.telefono as string);
    }
    const texto = JSON.stringify(lista);
    for (const p of PERSONAS) {
      expect(texto).not.toContain(p.direccion);
      expect(texto).not.toContain(p.telefono);
    }
  });

  it('nunca se envía la llave ni el IV por separado', async () => {
    for (const quien of [ana, auditor]) {
      const texto = JSON.stringify(await listar(quien));
      expect(texto).not.toContain(process.env['DATA_KEY'] as string);
      expect(texto).not.toMatch(/"(iv|tag|llave|key|data_key)"/i);
    }
  });

  it('un texto cifrado alterado marca solo esa fila con integra: false (sin 500) para el registrador', async () => {
    await corromper(2, 'telefono_cifrado');
    const lista = await listar(ana);
    expect(lista[0]).toMatchObject({ integra: true, telefono: PERSONAS[0]?.telefono });
    expect(lista[1]).toMatchObject({
      integra: false,
      telefono: null,
      direccion: PERSONAS[1]?.direccion, // el otro campo sigue bien
    });
  });

  it('lo mismo para el auditor: el campo corrupto va null (no ***) y el resto sigue enmascarado', async () => {
    await corromper(1, 'direccion_cifrada');
    const lista = await listar(auditor);
    expect(lista[0]).toMatchObject({ integra: false, direccion: null, telefono: '***' });
    expect(lista[1]).toMatchObject({ integra: true, direccion: '***', telefono: '***' });
  });

  it('si ambos campos están corruptos, ambos van null', async () => {
    await corromper(1, 'direccion_cifrada');
    await corromper(1, 'telefono_cifrado');
    expect((await listar(ana))[0]).toMatchObject({
      integra: false,
      direccion: null,
      telefono: null,
    });
  });

  it('el admin no ve personas (403) y sin sesión da 401', async () => {
    await http().get('/api/personas').set('Cookie', admin.cookie).expect(403);
    await http().get('/api/personas').expect(401);
  });
});
