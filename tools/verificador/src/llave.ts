import { createHash, createPublicKey } from 'node:crypto';

export interface LlaveFijada {
  /** SPKI DER en base64: es lo que consume `verificarCadena`. */
  spkiB64: string;
  /** SHA-256 hex del SPKI DER. */
  huella: string;
}

/** Lee un PEM con la llave pública del servidor (ECDSA P-256) y calcula su huella. */
export function leerLlaveFijada(pem: string): LlaveFijada {
  try {
    const llave = createPublicKey(pem);
    if (
      llave.asymmetricKeyType !== 'ec' ||
      llave.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new Error('no es ECDSA P-256');
    }
    const der = llave.export({ format: 'der', type: 'spki' });
    return {
      spkiB64: der.toString('base64'),
      huella: createHash('sha256').update(der).digest('hex'),
    };
  } catch {
    throw new Error(
      'La llave del servidor fijada no es una llave pública ECDSA P-256 válida (PEM)',
    );
  }
}
