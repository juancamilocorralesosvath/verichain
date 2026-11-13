import type { VerificadorFirma } from '@bc/core';
import { base64ABytes } from './pem';

/**
 * Verifica firmas ECDSA P-256 / SHA-256 en formato IEEE-P1363 (64 bytes) con WebCrypto.
 * El mensaje son los bytes ASCII del string. Entradas mal formadas dan `false`.
 */
export const verificarFirmaWeb: VerificadorFirma = async (llaveSpkiB64, mensaje, firmaB64) => {
  try {
    const llave = await crypto.subtle.importKey(
      'spki',
      base64ABytes(llaveSpkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      llave,
      base64ABytes(firmaB64),
      new TextEncoder().encode(mensaje),
    );
  } catch {
    return false;
  }
};
