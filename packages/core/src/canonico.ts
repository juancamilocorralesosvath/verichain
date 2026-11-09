import { CAMPOS_PERSONA, type FilaPersona } from './tipos.js';

const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Serialización canónica de una fila de persona: JSON sin espacios con las llaves
 * en el orden de CAMPOS_PERSONA. No normaliza Unicode ni recorta espacios.
 * Lanza Error si falta o sobra un campo, si algún valor no es string o si
 * `creado_en` no es ISO-8601 UTC con milisegundos.
 */
export function serializarPersona(fila: FilaPersona): string {
  if (typeof fila !== 'object' || fila === null || Array.isArray(fila)) {
    throw new Error('La fila debe ser un objeto');
  }
  const registro = fila as Record<string, unknown>;
  const claves = Object.keys(registro);
  for (const campo of CAMPOS_PERSONA) {
    if (!Object.hasOwn(registro, campo)) throw new Error(`Falta el campo "${campo}"`);
  }
  const extra = claves.find((c) => !(CAMPOS_PERSONA as readonly string[]).includes(c));
  if (extra !== undefined) throw new Error(`Campo no permitido "${extra}"`);

  const ordenado: Record<string, string> = {};
  for (const campo of CAMPOS_PERSONA) {
    const valor = registro[campo];
    if (typeof valor !== 'string') throw new Error(`El campo "${campo}" debe ser string`);
    ordenado[campo] = valor;
  }
  if (!ISO_UTC_MS.test(ordenado['creado_en'] as string)) {
    throw new Error('"creado_en" debe ser ISO-8601 UTC con milisegundos');
  }
  return JSON.stringify(ordenado);
}
