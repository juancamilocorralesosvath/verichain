import { solicitar } from './cliente';
import type { ValoresPersona } from '../validacion';

/**
 * Contrato de H4.2 (registrador: datos reales; auditor: '***'). Los campos son opcionales para
 * tolerar la forma actual de la API (antes de H4.2), que aún devuelve `direccion_cifrada`.
 */
export interface PersonaApi {
  id: number;
  cedula: string;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  creado_en: string;
  creado_por: string;
  integra?: boolean;
}

export async function listarPersonas(): Promise<PersonaApi[]> {
  const lista = await solicitar<unknown>('/personas');
  if (!Array.isArray(lista)) throw new Error('Respuesta inesperada del servidor');
  return lista as PersonaApi[];
}

// Antes de H5.3 se crea directo; H5.3 lo cambia al flujo preparar → firmar → confirmar.
export const crearPersona = (valores: ValoresPersona): Promise<unknown> =>
  solicitar('/personas', { method: 'POST', body: JSON.stringify(valores) });
