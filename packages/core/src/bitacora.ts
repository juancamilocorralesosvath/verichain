import { HASH_CERO } from './genesis.js';
import { sha256Hex } from './hash.js';

/** Campos de una entrada de la bitácora, en el orden canónico (no cambiar sin actualizar el diseño). */
export const CAMPOS_BITACORA = [
  'fecha',
  'usuario',
  'accion',
  'resultado',
  'ip',
  'detalle',
] as const;
export type EntradaBitacora = Record<(typeof CAMPOS_BITACORA)[number], string>;

const HEX64 = /^[0-9a-f]{64}$/;

/** hash = SHA-256(hashAnterior + JSON de la entrada en el orden de CAMPOS_BITACORA). */
export function hashEntradaBitacora(hashAnterior: string, entrada: EntradaBitacora): string {
  if (!HEX64.test(hashAnterior)) throw new Error('hashAnterior debe ser 64 hex en minúsculas');
  const ordenada: Record<string, string> = {};
  for (const campo of CAMPOS_BITACORA) {
    const valor = (entrada as Record<string, unknown>)[campo];
    if (typeof valor !== 'string')
      throw new Error(`El campo "${campo}" de la entrada debe ser un string`);
    ordenada[campo] = valor;
  }
  return sha256Hex(hashAnterior + JSON.stringify(ordenada));
}

/**
 * Recorre la bitácora en orden y comprueba que cada entrada encadena con la anterior (la primera
 * usa HASH_CERO). `primeraRota` es la posición (desde 0) de la primera entrada que no cuadra.
 * Nota: borrar entradas del FINAL no se detecta con el encadenamiento solo.
 */
export function verificarBitacora(entradas: Array<EntradaBitacora & { hash: string }>): {
  valida: boolean;
  primeraRota: number | null;
} {
  let anterior = HASH_CERO;
  for (let i = 0; i < entradas.length; i++) {
    const e = entradas[i] as EntradaBitacora & { hash: string };
    let esperado: string;
    try {
      esperado = hashEntradaBitacora(anterior, e);
    } catch {
      return { valida: false, primeraRota: i };
    }
    if (e.hash !== esperado) return { valida: false, primeraRota: i };
    anterior = e.hash;
  }
  return { valida: true, primeraRota: null };
}
