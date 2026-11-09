/**
 * @bc/core — punto de entrada.
 * Las historias de la épica E1 agregan aquí la serialización canónica, los hashes,
 * el PoW y la verificación de la cadena.
 */
export const CORE_VERSION = '0.1.0';

export { CAMPOS_PERSONA, type FilaPersona } from './tipos.js';
export { serializarPersona } from './canonico.js';
