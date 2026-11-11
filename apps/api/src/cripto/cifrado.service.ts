import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class ErrorDatoCorrupto extends Error {
  constructor() {
    super('Dato cifrado corrupto');
  }
}
export class CifradoService {
  private readonly llave: Buffer;
  constructor(clave: string | undefined) {
    if (!clave || !/^[A-Za-z0-9+/]{43}=$/.test(clave))
      throw new Error('DATA_KEY debe ser una llave de 32 bytes en base64');
    this.llave = Buffer.from(clave, 'base64');
    if (this.llave.length !== 32 || this.llave.toString('base64') !== clave)
      throw new Error('DATA_KEY debe ser una llave de 32 bytes en base64');
  }
  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.llave, iv);
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64');
  }
  descifrar(valor: string): string {
    try {
      const bytes = Buffer.from(valor, 'base64');
      if (bytes.length < 28 || bytes.toString('base64') !== valor) throw new Error();
      const descifrador = createDecipheriv('aes-256-gcm', this.llave, bytes.subarray(0, 12));
      descifrador.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString(
        'utf8',
      );
    } catch {
      throw new ErrorDatoCorrupto();
    }
  }
}
