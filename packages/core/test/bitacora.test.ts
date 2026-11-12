import { describe, expect, it } from 'vitest';
import {
  CAMPOS_BITACORA,
  HASH_CERO,
  hashEntradaBitacora,
  sha256Hex,
  verificarBitacora,
  type EntradaBitacora,
} from '../src/index.js';

const entrada = (i: number, extra: Partial<EntradaBitacora> = {}): EntradaBitacora => ({
  fecha: `2026-11-12T10:00:0${i}.000Z`,
  usuario: i % 2 === 0 ? 'ana' : '-',
  accion: i % 2 === 0 ? 'crear_bloque' : 'login_fallido',
  resultado: i % 2 === 0 ? 'ok' : 'fallo',
  ip: '127.0.0.1',
  detalle: `entrada ${i}`,
  ...extra,
});

/** Bitácora íntegra de n entradas, encadenada con la función de core. */
function cadena(n: number): Array<EntradaBitacora & { hash: string }> {
  const lista: Array<EntradaBitacora & { hash: string }> = [];
  let anterior = HASH_CERO;
  for (let i = 0; i < n; i++) {
    const e = entrada(i);
    const hash = hashEntradaBitacora(anterior, e);
    lista.push({ ...e, hash });
    anterior = hash;
  }
  return lista;
}

describe('hashEntradaBitacora', () => {
  it('es sha256(hashAnterior + JSON de la entrada en el orden de CAMPOS_BITACORA)', () => {
    const e = entrada(1);
    const ordenada = JSON.stringify(Object.fromEntries(CAMPOS_BITACORA.map((c) => [c, e[c]])));
    expect(hashEntradaBitacora(HASH_CERO, e)).toBe(sha256Hex(HASH_CERO + ordenada));
  });

  it('el orden en que lleguen las llaves del objeto no cambia el hash', () => {
    const e = entrada(2);
    const al_reves = Object.fromEntries(Object.entries(e).reverse()) as EntradaBitacora;
    expect(hashEntradaBitacora(HASH_CERO, al_reves)).toBe(hashEntradaBitacora(HASH_CERO, e));
  });

  it('cambiar un campo o el hash anterior cambia el hash', () => {
    const base = hashEntradaBitacora(HASH_CERO, entrada(1));
    for (const campo of CAMPOS_BITACORA) {
      expect(hashEntradaBitacora(HASH_CERO, entrada(1, { [campo]: 'otro' }))).not.toBe(base);
    }
    expect(hashEntradaBitacora('a'.repeat(64), entrada(1))).not.toBe(base);
  });

  it('lanza error con un hash anterior inválido o una entrada incompleta', () => {
    expect(() => hashEntradaBitacora('xyz', entrada(1))).toThrow();
    const incompleta: Partial<EntradaBitacora> = entrada(1);
    delete incompleta.detalle;
    expect(() => hashEntradaBitacora(HASH_CERO, incompleta as EntradaBitacora)).toThrow();
    expect(() =>
      hashEntradaBitacora(HASH_CERO, { ...entrada(1), ip: 5 } as unknown as EntradaBitacora),
    ).toThrow();
  });
});

describe('verificarBitacora', () => {
  it('una bitácora íntegra es válida (y la vacía también)', () => {
    expect(verificarBitacora(cadena(5))).toEqual({ valida: true, primeraRota: null });
    expect(verificarBitacora([])).toEqual({ valida: true, primeraRota: null });
  });

  it('alterar el detalle de una entrada la invalida en esa posición', () => {
    const lista = cadena(5);
    (lista[2] as { detalle: string }).detalle = 'alterado';
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 2 });
  });

  it('borrar una entrada del medio rompe la que sigue', () => {
    const lista = cadena(5);
    lista.splice(2, 1);
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 2 });
  });

  it('borrar la primera entrada rompe la nueva primera (ya no encadena con HASH_CERO)', () => {
    const lista = cadena(4);
    lista.shift();
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 0 });
  });

  it('intercambiar dos entradas rompe la primera de ellas', () => {
    const lista = cadena(5);
    [lista[1], lista[2]] = [lista[2] as (typeof lista)[number], lista[1] as (typeof lista)[number]];
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 1 });
  });

  it('un hash guardado distinto del calculado se detecta aunque los datos estén intactos', () => {
    const lista = cadena(3);
    (lista[1] as { hash: string }).hash = 'f'.repeat(64);
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 1 });
  });

  it('una entrada mal formada no lanza: marca la bitácora como rota en esa posición', () => {
    const lista = cadena(3);
    (lista[1] as unknown as { ip: number }).ip = 5;
    expect(verificarBitacora(lista)).toEqual({ valida: false, primeraRota: 1 });
  });
});
