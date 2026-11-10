import { verify } from 'node:crypto';
import type { VerificadorFirma } from '@bc/core';

/**
 * VerificadorFirma de Node: ECDSA P-256 con SHA-256, llave SPKI DER en base64 y firma
 * IEEE-P1363 (r||s) en base64. Entradas mal formadas dan `false`, nunca una excepción.
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
