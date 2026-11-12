import { verify } from 'node:crypto';
import type { VerificadorFirma } from '@bc/core';

/**
 * Verifica firmas ECDSA P-256 / SHA-256 en formato IEEE-P1363 con `node:crypto`. Igual que el de la
 * API, pero sin importarla: este paquete es independiente del servidor. Entradas mal formadas dan false.
 */
export const verificarFirmaNode: VerificadorFirma = async (llaveSpkiB64, mensaje, firmaB64) => {
  try {
    return verify(
      'sha256',
      Buffer.from(mensaje, 'ascii'),
      {
        key: Buffer.from(llaveSpkiB64, 'base64'),
        format: 'der',
        type: 'spki',
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(firmaB64, 'base64'),
    );
  } catch {
    return false;
  }
};
