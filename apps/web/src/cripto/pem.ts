/** Utilidades para la llave pública del servidor fijada por quien verifica (formato PEM). */

const aBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
};

/** Convierte un PEM "PUBLIC KEY" en SPKI DER codificado en base64. */
export function pemASpki(pem: string): string {
  const coincide = /-----BEGIN PUBLIC KEY-----([A-Za-z0-9+/=\s]+)-----END PUBLIC KEY-----/.exec(
    pem,
  );
  const cuerpo = coincide?.[1]?.replace(/\s+/g, '');
  if (!cuerpo) throw new Error('La llave del servidor no es un PEM de llave pública válido');
  try {
    atob(cuerpo);
  } catch {
    throw new Error('La llave del servidor no es un PEM de llave pública válido');
  }
  return cuerpo;
}

/** SHA-256 en hexadecimal del SPKI DER (la huella que muestra la API y el CLI). */
export async function huellaSpkiHexDe(spkiB64: string): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-256', aBytes(spkiB64));
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { aBytes as base64ABytes };
