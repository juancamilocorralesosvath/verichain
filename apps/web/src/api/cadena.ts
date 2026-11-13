import { solicitar } from './cliente';
import type { ReporteCadena } from '@bc/core';

export interface BloqueApi {
  indice: number;
  persona_id: number | null;
  hash_datos: string;
  nonce: number;
  hash_anterior: string;
  hash_cadena: string;
  firma_usuario: string | null;
  llave_id: number | null;
  creado_en: string;
}

export async function listarCadena(): Promise<BloqueApi[]> {
  const lista = await solicitar<unknown>('/cadena');
  if (!Array.isArray(lista)) throw new Error('Respuesta inesperada del servidor');
  return lista as BloqueApi[];
}

export async function verificarCadena(): Promise<ReporteCadena> {
  const reporte = await solicitar<unknown>('/cadena/verificar');
  if (
    typeof reporte !== 'object' ||
    reporte === null ||
    !Array.isArray((reporte as ReporteCadena).bloques)
  )
    throw new Error('Respuesta inesperada del servidor');
  return reporte as ReporteCadena;
}
