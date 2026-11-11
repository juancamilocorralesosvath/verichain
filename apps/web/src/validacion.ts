/** Validación informativa del formulario: replica el DTO del servidor. La real es la de la API. */
export type Campo = 'cedula' | 'nombre' | 'direccion' | 'telefono';
export type ValoresPersona = Record<Campo, string>;

export interface ResultadoValidacion {
  valido: boolean;
  errores: Partial<Record<Campo, string>>;
  /** Valores con trim y NFC, tal como los normaliza el servidor. */
  normalizado: ValoresPersona;
}

const normalizar = (texto: string): string => texto.trim().normalize('NFC');

export function validarPersona(valores: ValoresPersona): ResultadoValidacion {
  const normalizado: ValoresPersona = {
    cedula: normalizar(valores.cedula),
    nombre: normalizar(valores.nombre),
    direccion: normalizar(valores.direccion),
    telefono: normalizar(valores.telefono),
  };
  const errores: Partial<Record<Campo, string>> = {};
  if (!/^\d{6,10}$/.test(normalizado.cedula)) {
    errores.cedula = 'La cédula debe tener entre 6 y 10 dígitos';
  }
  if (
    normalizado.nombre.length < 2 ||
    normalizado.nombre.length > 100 ||
    !/^[\p{L}\p{M}' -]+$/u.test(normalizado.nombre)
  ) {
    errores.nombre =
      "El nombre debe tener entre 2 y 100 caracteres (letras, espacios, tildes, ñ, ' y -)";
  }
  if (normalizado.direccion.length < 5 || normalizado.direccion.length > 150) {
    errores.direccion = 'La dirección debe tener entre 5 y 150 caracteres';
  }
  if (!/^\+?\d{7,15}$/.test(normalizado.telefono)) {
    errores.telefono = 'El teléfono debe tener entre 7 y 15 dígitos (+ opcional)';
  }
  return { valido: Object.keys(errores).length === 0, errores, normalizado };
}
