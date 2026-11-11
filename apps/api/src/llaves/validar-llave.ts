import { createPublicKey } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/** Acepta solo una llave pública EC P-256 en SPKI DER (base64 canónico). Si no, 400. */
export function validarLlaveP256(spkiB64: string): void {
  try {
    const der = Buffer.from(spkiB64, 'base64');
    if (der.toString('base64') !== spkiB64) throw new Error('base64 no canónico');
    const llave = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (
      llave.asymmetricKeyType !== 'ec' ||
      llave.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new Error('no es EC P-256');
    }
  } catch {
    throw new BadRequestException('Llave pública inválida');
  }
}
