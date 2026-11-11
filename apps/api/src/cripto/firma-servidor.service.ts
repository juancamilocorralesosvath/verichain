import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';

const AYUDA = 'Genérala con: npm run llaves:servidor -w @bc/api';

/**
 * Llave de firma del servidor (ECDSA P-256) para el sello de la cadena (diseño §5.4).
 * La privada se lee de un archivo fuera de la BD y nunca se expone ni se registra.
 */
@Injectable()
export class FirmaServidorService {
  readonly #privada: KeyObject;
  readonly #publica: KeyObject;

  constructor(ruta: string) {
    let privada: KeyObject;
    try {
      privada = createPrivateKey(readFileSync(ruta));
    } catch {
      // el mensaje nunca incluye el contenido del archivo
      throw new Error(
        `No se pudo leer la llave de firma del servidor en "${ruta}" (falta o no es una llave válida). ${AYUDA}`,
      );
    }
    if (
      privada.asymmetricKeyType !== 'ec' ||
      privada.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new Error(`La llave de firma del servidor debe ser ECDSA P-256. ${AYUDA}`);
    }
    this.#privada = privada;
    this.#publica = createPublicKey(privada);
  }

  /** Crea el servicio con `SERVER_SIGNING_KEY_PATH` (por defecto ./secrets/server-signing-key.pem). */
  static desdeEntorno(): FirmaServidorService {
    return new FirmaServidorService(
      process.env['SERVER_SIGNING_KEY_PATH'] ?? './secrets/server-signing-key.pem',
    );
  }

  /** Firma ECDSA P-256 / SHA-256 (IEEE-P1363, base64) de los bytes ASCII de `${indice}:${hash_cadena}`. */
  firmarSello(indice: number, hashCadena: string): string {
    return sign('sha256', Buffer.from(`${indice}:${hashCadena}`, 'ascii'), {
      key: this.#privada,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64');
  }

  private spkiDer(): Buffer {
    return this.#publica.export({ format: 'der', type: 'spki' });
  }

  llavePublicaSpkiB64(): string {
    return this.spkiDer().toString('base64');
  }

  llavePublicaPem(): string {
    return this.#publica.export({ format: 'pem', type: 'spki' }) as string;
  }

  /** SHA-256 (hex) del SPKI DER de la pública: la huella que se publica y se compara a mano. */
  huellaSha256Hex(): string {
    return createHash('sha256').update(this.spkiDer()).digest('hex');
  }
}
