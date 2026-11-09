import { describe, expect, it } from 'vitest';
import { HASH_CERO, calcularHashCadena, cumpleDificultad, minar, sha256Hex } from '../src/index.js';

declare const console: { log(...args: unknown[]): void };

const HD = sha256Hex('datos');

describe('cumpleDificultad', () => {
  it('acepta hashes con al menos N ceros iniciales', () => {
    expect(cumpleDificultad('000abc' + 'f'.repeat(58), 3)).toBe(true);
    expect(cumpleDificultad('f'.repeat(64), 0)).toBe(true);
  });
  it('rechaza un hash con menos ceros', () => {
    expect(cumpleDificultad('00abc' + 'f'.repeat(59), 3)).toBe(false);
  });
});

describe('minar', () => {
  it('con dificultad 0 el nonce es 0', () => {
    const r = minar(HASH_CERO, HD, 0);
    expect(r.nonce).toBe(0);
    expect(r.intentos).toBe(1);
  });

  it('con dificultad 3 el hash empieza con 000 y coincide con calcularHashCadena', () => {
    const r = minar(HASH_CERO, HD, 3);
    expect(r.hashCadena.startsWith('000')).toBe(true);
    expect(r.hashCadena).toBe(calcularHashCadena(HASH_CERO, HD, r.nonce));
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it('lanza error si supera maxIntentos', () => {
    expect(() => minar(HASH_CERO, HD, 6, { maxIntentos: 1 })).toThrow(Error);
  });

  it.each([-1, 9, 1.5, NaN])('lanza error con dificultad fuera de rango: %s', (d) => {
    expect(() => minar(HASH_CERO, HD, d)).toThrow(Error);
  });

  it('informativa: tiempo de minado con dificultad 4', () => {
    const r = minar(HASH_CERO, HD, 4);
    console.log(`PoW dificultad 4: ${r.ms.toFixed(1)} ms, ${r.intentos} intentos`);
    expect(cumpleDificultad(r.hashCadena, 4)).toBe(true);
  });
});
