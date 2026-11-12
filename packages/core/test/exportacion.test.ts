import { describe, expect, it } from 'vitest';
import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  aOpcionesVerificacion,
  parsearExportacion,
  type VerificadorFirma,
} from '../src/index.js';

const h = (c: string): string => c.repeat(64);
const persona = (): Record<string, string> => ({
  cedula: '1234567',
  nombre: 'Ana Pérez',
  direccion_cifrada: 'ZGlyZWNjaW9u',
  telefono_cifrado: 'dGVsZWZvbm8=',
  creado_en: '2026-11-09T12:30:45.123Z',
  creado_por: 'ana',
});
const valida = (): Record<string, unknown> => ({
  formato: 'bc-export/1',
  exportado_en: '2026-11-12T10:00:00.000Z',
  dificultad: 2,
  bloques: [
    {
      indice: 0,
      hash_datos: HASH_DATOS_GENESIS,
      nonce: 7,
      hash_anterior: HASH_CERO,
      hash_cadena: h('a'),
      firma_usuario: null,
      llave_id: null,
      persona: null,
    },
    {
      indice: 1,
      hash_datos: h('b'),
      nonce: 9,
      hash_anterior: h('a'),
      hash_cadena: h('c'),
      firma_usuario: 'AAAA',
      llave_id: 3,
      persona: persona(),
    },
  ],
  llaves_usuarios: { '3': 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' },
  sello: { indice: 1, hash_cadena: h('c'), firma: 'AAAA' },
  llave_servidor_spki_b64: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE',
  huella_llave_servidor: h('d'),
});
const con = (cambio: (x: Record<string, unknown>) => void): unknown => {
  const x = valida();
  cambio(x);
  return x;
};

describe('parsearExportacion', () => {
  it('acepta una exportación válida y la devuelve tipada', () => {
    const e = parsearExportacion(valida());
    expect(e.formato).toBe('bc-export/1');
    expect(e.bloques).toHaveLength(2);
    expect(e.bloques[1]?.persona?.nombre).toBe('Ana Pérez');
    expect(e.llaves_usuarios['3']).toBeTruthy();
    expect(e.sello?.indice).toBe(1);
  });

  it('acepta un sello null (cadena sin sello: el verificador la marcará)', () => {
    expect(parsearExportacion(con((x) => (x['sello'] = null))).sello).toBeNull();
  });

  it('acepta el JSON como texto', () => {
    expect(parsearExportacion(JSON.parse(JSON.stringify(valida()))).bloques).toHaveLength(2);
  });

  it.each([
    ['null', null],
    ['texto', 'hola'],
    ['arreglo', []],
    ['objeto vacío', {}],
    ['formato desconocido', con((x) => (x['formato'] = 'bc-export/2'))],
    ['sin formato', con((x) => delete x['formato'])],
    ['sin bloques', con((x) => delete x['bloques'])],
    ['bloques vacío', con((x) => (x['bloques'] = []))],
    ['bloques no es arreglo', con((x) => (x['bloques'] = {}))],
    ['dificultad fuera de rango', con((x) => (x['dificultad'] = 9))],
    ['dificultad no entera', con((x) => (x['dificultad'] = 2.5))],
    ['sin llave del servidor', con((x) => delete x['llave_servidor_spki_b64'])],
    ['huella inválida', con((x) => (x['huella_llave_servidor'] = 'xyz'))],
    ['llaves_usuarios con valor no texto', con((x) => (x['llaves_usuarios'] = { '1': 5 }))],
    ['llaves_usuarios con id no numérico', con((x) => (x['llaves_usuarios'] = { a: 'AAAA' }))],
    ['sello sin firma', con((x) => (x['sello'] = { indice: 1, hash_cadena: h('c') }))],
    [
      'sello con hash inválido',
      con((x) => (x['sello'] = { indice: 1, hash_cadena: 'x', firma: 'A' })),
    ],
    ['exportado_en ausente', con((x) => delete x['exportado_en'])],
  ])('rechaza con un error claro: %s', (_n, valor) => {
    expect(() => parsearExportacion(valor)).toThrow(/Exportación inválida/);
  });

  it.each([
    ['hash_datos corto', (b: Record<string, unknown>) => (b['hash_datos'] = 'abc')],
    ['hash_cadena en mayúsculas', (b: Record<string, unknown>) => (b['hash_cadena'] = h('A'))],
    ['nonce negativo', (b: Record<string, unknown>) => (b['nonce'] = -1)],
    ['indice decimal', (b: Record<string, unknown>) => (b['indice'] = 1.5)],
    ['firma_usuario numérica', (b: Record<string, unknown>) => (b['firma_usuario'] = 5)],
    [
      'persona sin campo',
      (b: Record<string, unknown>) => delete (b['persona'] as Record<string, unknown>)['nombre'],
    ],
    [
      'persona con campo extra',
      (b: Record<string, unknown>) => ((b['persona'] as Record<string, unknown>)['extra'] = 'x'),
    ],
    [
      'persona con valor no texto',
      (b: Record<string, unknown>) => ((b['persona'] as Record<string, unknown>)['cedula'] = 12),
    ],
  ])('rechaza un bloque inválido: %s', (_n, cambio) => {
    const x = valida();
    cambio((x['bloques'] as Array<Record<string, unknown>>)[1] as Record<string, unknown>);
    expect(() => parsearExportacion(x)).toThrow(/Exportación inválida/);
  });

  it('el mensaje de formato desconocido nombra el formato', () => {
    expect(() => parsearExportacion(con((x) => (x['formato'] = 'otro/9')))).toThrow(/formato/i);
  });
});

describe('aOpcionesVerificacion', () => {
  const verificarFirma: VerificadorFirma = async () => true;

  it('arma las opciones con las llaves numéricas y la llave del servidor FIJADA por quien verifica', () => {
    const e = parsearExportacion(valida());
    const o = aOpcionesVerificacion(e, { verificarFirma, llavePublicaServidor: 'FIJADA' });
    expect(o.dificultad).toBe(2);
    expect(o.llavesUsuarios).toEqual({ 3: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' });
    expect(o.sello).toEqual(e.sello);
    expect(o.llavePublicaServidor).toBe('FIJADA'); // nunca la del JSON
    expect(o.verificarFirma).toBe(verificarFirma);
  });

  it('sin llave del servidor fijada lanza error (no se confía en la del archivo)', () => {
    const e = parsearExportacion(valida());
    expect(() => aOpcionesVerificacion(e, { verificarFirma, llavePublicaServidor: '' })).toThrow(
      /llave del servidor/i,
    );
  });
});
