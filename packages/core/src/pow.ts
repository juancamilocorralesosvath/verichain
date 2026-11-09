import { calcularHashCadena } from './hash.js';

/** `performance` existe en Node y en el navegador; core no incluye tipos DOM ni de Node. */
declare const performance: { now(): number };

export interface ResultadoMinado {
  nonce: number;
  hashCadena: string;
  intentos: number;
  ms: number;
}

const MAX_INTENTOS_POR_DEFECTO = 50_000_000;

function validarDificultad(dificultad: number): void {
  if (!Number.isInteger(dificultad) || dificultad < 0 || dificultad > 8) {
    throw new Error('dificultad debe ser un entero entre 0 y 8');
  }
}

/** true si el hash (hex) empieza con `dificultad` ceros. */
export function cumpleDificultad(hashHex: string, dificultad: number): boolean {
  validarDificultad(dificultad);
  return hashHex.startsWith('0'.repeat(dificultad));
}

/** Busca el primer nonce >= 0 cuyo hash_cadena cumple la dificultad. */
export function minar(
  hashAnterior: string,
  hashDatos: string,
  dificultad: number,
  opciones: { maxIntentos?: number } = {},
): ResultadoMinado {
  validarDificultad(dificultad);
  const maxIntentos = opciones.maxIntentos ?? MAX_INTENTOS_POR_DEFECTO;
  const inicio = performance.now();
  for (let nonce = 0; nonce < maxIntentos; nonce++) {
    const hashCadena = calcularHashCadena(hashAnterior, hashDatos, nonce);
    if (cumpleDificultad(hashCadena, dificultad)) {
      return { nonce, hashCadena, intentos: nonce + 1, ms: performance.now() - inicio };
    }
  }
  throw new Error(`No se encontró un nonce en ${maxIntentos} intentos`);
}
