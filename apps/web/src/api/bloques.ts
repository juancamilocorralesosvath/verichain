import { solicitar } from './cliente';
import type { ValoresPersona } from '../validacion';

export interface BorradorApi {
  borrador_id: string;
  hash_datos: string;
}

/** Paso 1: el servidor valida, cifra y devuelve el `hash_datos` que hay que firmar. */
export const prepararBloque = (valores: ValoresPersona): Promise<BorradorApi> =>
  solicitar<BorradorApi>('/bloques/preparar', { method: 'POST', body: JSON.stringify(valores) });

/** Paso 3: con la firma hecha en el navegador, el servidor la verifica y anexa el bloque. */
export const confirmarBloque = (datos: {
  borrador_id: string;
  llave_id: number;
  firma_b64: string;
}): Promise<unknown> =>
  solicitar('/bloques/confirmar', { method: 'POST', body: JSON.stringify(datos) });
