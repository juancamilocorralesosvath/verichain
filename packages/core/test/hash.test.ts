import { describe, expect, it } from 'vitest';
import {
  DATOS_GENESIS,
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashCadena,
  calcularHashDatos,
  serializarPersona,
  sha256Hex,
  type FilaPersona,
} from '../src/index.js';

const fila: FilaPersona = {
  cedula: '1234567890',
  nombre: 'Ana Pérez',
  direccion_cifrada: 'ZGlyZWNjaW9u',
  telefono_cifrado: 'dGVsZWZvbm8=',
  creado_en: '2026-11-09T12:30:45.123Z',
  creado_por: 'usuario-1',
};
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

describe('sha256Hex', () => {
  it('vector NIST "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('vector de la cadena vacía', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('codifica en UTF-8', () => {
    expect(sha256Hex('ñ')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('ñ')).not.toBe(sha256Hex('n'));
  });
});

describe('calcularHashDatos', () => {
  it('es el SHA-256 de la serialización canónica', () => {
    expect(calcularHashDatos(fila)).toBe(sha256Hex(serializarPersona(fila)));
  });
  it.each([
    ['cedula', '1234567891'],
    ['nombre', 'Ana Perez'],
    ['direccion_cifrada', 'ZGlyZWNjaW9v'],
    ['telefono_cifrado', 'dGVsZWZvbm9='],
    ['creado_en', '2026-11-09T12:30:45.124Z'],
    ['creado_por', 'usuario-2'],
  ])('cambiar un carácter de %s cambia el hash', (campo, valor) => {
    expect(calcularHashDatos({ ...fila, [campo]: valor })).not.toBe(calcularHashDatos(fila));
  });
});

describe('calcularHashCadena', () => {
  it('es sha256 de la concatenación directa', () => {
    expect(calcularHashCadena(H1, H2, 7)).toBe(sha256Hex(H1 + H2 + '7'));
  });
  it('cambiar hashAnterior, hashDatos o nonce cambia el resultado', () => {
    const base = calcularHashCadena(H1, H2, 7);
    expect(calcularHashCadena('c'.repeat(64), H2, 7)).not.toBe(base);
    expect(calcularHashCadena(H1, 'c'.repeat(64), 7)).not.toBe(base);
    expect(calcularHashCadena(H1, H2, 8)).not.toBe(base);
  });
  it.each([
    ['hashAnterior corto', 'a'.repeat(63), H2, 0],
    ['hashAnterior mayúsculas', 'A'.repeat(64), H2, 0],
    ['hashAnterior no hex', 'g'.repeat(64), H2, 0],
    ['hashDatos corto', H1, 'b'.repeat(65), 0],
    ['hashDatos vacío', H1, '', 0],
    ['nonce negativo', H1, H2, -1],
    ['nonce decimal', H1, H2, 1.5],
    ['nonce NaN', H1, H2, NaN],
    ['nonce infinito', H1, H2, Infinity],
  ])('lanza error con %s', (_n, a, d, nonce) => {
    expect(() => calcularHashCadena(a, d, nonce)).toThrow(Error);
  });
});

describe('génesis', () => {
  it('constantes', () => {
    expect(HASH_CERO).toBe('0'.repeat(64));
    expect(DATOS_GENESIS).toBe('GENESIS');
    expect(HASH_DATOS_GENESIS).toBe(sha256Hex('GENESIS'));
  });
});
