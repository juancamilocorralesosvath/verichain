import { sha256Hex } from './hash.js';

/** hash_anterior del bloque génesis. */
export const HASH_CERO = '0'.repeat(64);
/** Datos fijos del bloque génesis. */
export const DATOS_GENESIS = 'GENESIS';
export const HASH_DATOS_GENESIS: string = sha256Hex(DATOS_GENESIS);
