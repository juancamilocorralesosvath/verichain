import { solicitar } from './cliente';
import type { ValoresPersona } from '../validacion';

export interface BorradorApi {
  borrador_id: string;
  hash_datos: string;
}

/** Paso 1: el servidor valida, cifra y devuelve el `hash_datos` que hay que firmar. */
export const prepararBloque = (valores: ValoresPersona): Promise<BorradorApi> =>
  solicitar<BorradorApi>('/bloques/preparar', { method: 'POST', body: JSON.stringify(valores) });

export interface ResultadoConfirmar {
  indice?: number;
  /** Datos del minado (H10.2); pueden faltar en respuestas antiguas. */
  nonce?: number;
  intentos?: number;
  ms?: number;
}

/** Paso 3: con la firma hecha en el navegador, el servidor la verifica y anexa el bloque. */
export const confirmarBloque = (datos: {
  borrador_id: string;
  llave_id: number;
  firma_b64: string;
}): Promise<ResultadoConfirmar> =>
  solicitar<ResultadoConfirmar>('/bloques/confirmar', {
    method: 'POST',
    body: JSON.stringify(datos),
  });

export interface LoteApi {
  validas: { fila: number; borrador_id: string; hash_datos: string }[];
  invalidas: { fila: number; errores: string[] }[];
}

export interface ResultadoLote {
  anexadas: number[];
  error: string | null;
}

/** H7.1: el servidor valida el CSV (multipart, campo `archivo`) y prepara un borrador por fila válida. */
export const prepararLote = (archivo: File): Promise<LoteApi> => {
  const datos = new FormData();
  datos.append('archivo', archivo);
  return solicitar<LoteApi>('/bloques/preparar-lote', { method: 'POST', body: datos });
};

/** H7.1: confirma los borradores firmados, en orden; se detiene en el primer fallo. */
export const confirmarLote = (
  items: { borrador_id: string; llave_id: number; firma_b64: string }[],
): Promise<ResultadoLote> =>
  solicitar<ResultadoLote>('/bloques/confirmar-lote', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
