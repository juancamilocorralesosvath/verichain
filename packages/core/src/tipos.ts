/** Campos de una fila de persona, en el orden canónico (no cambiar sin actualizar el diseño). */
export const CAMPOS_PERSONA = [
  'cedula',
  'nombre',
  'direccion_cifrada',
  'telefono_cifrado',
  'creado_en',
  'creado_por',
] as const;

export type FilaPersona = Record<(typeof CAMPOS_PERSONA)[number], string>;
