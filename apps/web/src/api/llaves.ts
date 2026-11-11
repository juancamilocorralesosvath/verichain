import { solicitar } from './cliente';

/** Una llave del usuario registrada en el servidor (H5.2). */
export interface LlaveServidor {
  id: number;
  version: number;
  estado: 'pendiente' | 'aprobada' | 'reemplazada' | 'rechazada';
  spki_b64: string;
}

export async function misLlaves(): Promise<LlaveServidor[]> {
  const lista = await solicitar<unknown>('/llaves/mias');
  if (!Array.isArray(lista)) throw new Error('Respuesta inesperada del servidor');
  return lista as LlaveServidor[];
}

/** Registra la pública (SPKI base64); queda pendiente hasta que la apruebe un admin. */
export const registrarLlave = (spkiB64: string): Promise<LlaveServidor> =>
  solicitar<LlaveServidor>('/llaves', {
    method: 'POST',
    body: JSON.stringify({ spki_b64: spkiB64 }),
  });
