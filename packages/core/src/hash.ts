import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { serializarPersona } from './canonico.js';
import type { FilaPersona } from './tipos.js';

const HEX64 = /^[0-9a-f]{64}$/;

/** SHA-256 de un texto (UTF-8) en hex minúsculas, 64 caracteres. */
export function sha256Hex(texto: string): string {
  return bytesToHex(sha256(utf8ToBytes(texto)));
}

/** hash_datos = SHA-256 de la serialización canónica de la fila. */
export function calcularHashDatos(fila: FilaPersona): string {
  return sha256Hex(serializarPersona(fila));
}

/** hash_cadena = SHA-256(hashAnterior ‖ hashDatos ‖ nonce), concatenación directa. */
export function calcularHashCadena(hashAnterior: string, hashDatos: string, nonce: number): string {
  if (!HEX64.test(hashAnterior)) throw new Error('hashAnterior debe ser 64 hex en minúsculas');
  if (!HEX64.test(hashDatos)) throw new Error('hashDatos debe ser 64 hex en minúsculas');
  if (!Number.isInteger(nonce) || nonce < 0) throw new Error('nonce debe ser un entero >= 0');
  return sha256Hex(hashAnterior + hashDatos + String(nonce));
}
