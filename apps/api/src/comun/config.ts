/** Dificultad del PoW (`POW_DIFFICULTY`, entero 0–8; por defecto 4). */
export function dificultadPow(): number {
  const crudo = process.env['POW_DIFFICULTY'];
  const valor = crudo === undefined || crudo === '' ? 4 : Number(crudo);
  if (!Number.isInteger(valor) || valor < 0 || valor > 8) {
    throw new Error('POW_DIFFICULTY debe ser un entero entre 0 y 8');
  }
  return valor;
}
