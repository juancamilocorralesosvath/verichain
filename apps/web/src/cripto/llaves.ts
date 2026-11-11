/**
 * Llaves de firma del usuario (ECDSA P-256) con WebCrypto. La privada nunca sale del navegador
 * sin cifrar: el respaldo va cifrado con AES-GCM y una llave derivada con PBKDF2 (diseño §5.3, §7b).
 */
export interface ParLlaves {
  publica: CryptoKey;
  privada: CryptoKey;
}

export interface Respaldo {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
  spki: string;
}

export class ErrorRespaldo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorRespaldo';
  }
}

const CURVA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const FIRMA = { name: 'ECDSA', hash: 'SHA-256' } as const;
const ITER_POR_DEFECTO = 600_000;
const ITER_MIN = 100_000;
const ITER_MAX = 2_000_000;
const LARGO_MIN_PASSWORD = 12;

const codificar = (texto: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(texto);

function aBase64(datos: ArrayBuffer | Uint8Array): string {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/** Base64 estricto: si no es base64 válido lanza ErrorRespaldo. */
function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  if (texto.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) {
    throw new ErrorRespaldo('El respaldo está dañado o no tiene el formato esperado');
  }
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

export const generarPar = async (): Promise<ParLlaves> => {
  const par = await crypto.subtle.generateKey(CURVA, true, ['sign', 'verify']);
  return { publica: par.publicKey, privada: par.privateKey };
};

/** Pública en SPKI DER, base64: es lo que se registra en el servidor (H5.2). */
export async function exportarPublicaSpkiB64(publica: CryptoKey): Promise<string> {
  return aBase64(await crypto.subtle.exportKey('spki', publica));
}

/** Huella SHA-256 (hex) de la pública, para reconocerla a simple vista. */
export async function huellaSpkiHex(spkiB64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', deBase64(spkiB64));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Firma `hash_datos` (los bytes del string hex) con ECDSA P-256 / SHA-256.
 * WebCrypto devuelve el formato IEEE-P1363 (r||s, 64 bytes), que es el que espera el servidor.
 */
export async function firmarHashDatos(privada: CryptoKey, hashDatosHex: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(hashDatosHex)) {
    throw new Error('hash_datos debe ser un SHA-256 en hex minúsculas (64 caracteres)');
  }
  return aBase64(await crypto.subtle.sign(FIRMA, privada, codificar(hashDatosHex)));
}

/** Verifica una firma P1363 en base64. Entradas mal formadas dan false. */
export async function verificarFirma(
  publica: CryptoKey,
  mensaje: string,
  firmaB64: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(FIRMA, publica, deBase64(firmaB64), codificar(mensaje));
  } catch {
    return false;
  }
}

/** El encabezado va como datos autenticados del AES-GCM: no se puede alterar sin romper el descifrado. */
const encabezado = (
  r: Pick<Respaldo, 'v' | 'kdf' | 'iter' | 'salt' | 'spki'>,
): Uint8Array<ArrayBuffer> => codificar(`${r.v}|${r.kdf}|${r.iter}|${r.salt}|${r.spki}`);

async function derivarClave(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iter: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    codificar(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Respaldo cifrado de la privada: PBKDF2-SHA-256 (600 000 iter.) + AES-256-GCM. Contraseña de ≥ 12 caracteres. */
export async function crearRespaldo(par: ParLlaves, password: string): Promise<Respaldo> {
  if (password.length < LARGO_MIN_PASSWORD) {
    throw new ErrorRespaldo(`La contraseña debe tener al menos ${LARGO_MIN_PASSWORD} caracteres`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const parcial = {
    v: 1 as const,
    kdf: 'PBKDF2-SHA256' as const,
    iter: ITER_POR_DEFECTO,
    salt: aBase64(salt),
    spki: await exportarPublicaSpkiB64(par.publica),
  };
  const clave = await derivarClave(password, salt, ITER_POR_DEFECTO);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privada);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encabezado(parcial) },
    clave,
    pkcs8,
  );
  return { ...parcial, iv: aBase64(iv), ct: aBase64(ct) };
}

function validarForma(valor: unknown): Respaldo {
  const r = valor as Partial<Record<keyof Respaldo, unknown>> | null;
  const formaInvalida = new ErrorRespaldo('El archivo no es un respaldo de llave válido');
  if (typeof r !== 'object' || r === null) throw formaInvalida;
  if (r.v !== 1 || r.kdf !== 'PBKDF2-SHA256') throw formaInvalida;
  if (
    typeof r.iter !== 'number' ||
    !Number.isInteger(r.iter) ||
    r.iter < ITER_MIN ||
    r.iter > ITER_MAX
  ) {
    throw new ErrorRespaldo('El respaldo tiene un número de iteraciones no permitido');
  }
  for (const campo of ['salt', 'iv', 'ct', 'spki'] as const) {
    if (typeof r[campo] !== 'string') throw formaInvalida;
  }
  const respaldo = r as Respaldo;
  if (deBase64(respaldo.salt).length !== 16 || deBase64(respaldo.iv).length !== 12)
    throw formaInvalida;
  deBase64(respaldo.ct);
  deBase64(respaldo.spki);
  return respaldo;
}

/** Proceso inverso a `crearRespaldo`. Todo fallo es un `ErrorRespaldo` con mensaje claro. */
export async function importarRespaldo(valor: unknown, password: string): Promise<ParLlaves> {
  const respaldo = validarForma(valor);
  let pkcs8: ArrayBuffer;
  try {
    const clave = await derivarClave(password, deBase64(respaldo.salt), respaldo.iter);
    pkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(respaldo.iv), additionalData: encabezado(respaldo) },
      clave,
      deBase64(respaldo.ct),
    );
  } catch {
    throw new ErrorRespaldo('Contraseña incorrecta o respaldo dañado');
  }
  try {
    const privada = await crypto.subtle.importKey('pkcs8', pkcs8, CURVA, true, ['sign']);
    // la pública se deriva de la privada (no se confía en el campo spki del archivo)
    const { x, y } = await crypto.subtle.exportKey('jwk', privada);
    const publica = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x, y, ext: true },
      CURVA,
      true,
      ['verify'],
    );
    if ((await exportarPublicaSpkiB64(publica)) !== respaldo.spki) {
      throw new ErrorRespaldo(
        'El respaldo es inconsistente: la llave pública no corresponde a la privada',
      );
    }
    return { publica, privada };
  } catch (error) {
    if (error instanceof ErrorRespaldo) throw error;
    throw new ErrorRespaldo('El respaldo contiene una llave no válida');
  }
}
