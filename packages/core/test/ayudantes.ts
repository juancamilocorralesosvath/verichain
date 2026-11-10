import {
  HASH_CERO,
  HASH_DATOS_GENESIS,
  calcularHashDatos,
  minar,
  type BloqueCadena,
  type FilaPersona,
  type OpcionesVerificacion,
  type Sello,
  type VerificadorFirma,
} from '../src/index.js';

// core no incluye tipos DOM ni de Node: se declara solo lo que usan las pruebas.
interface LlaveCripto {
  readonly type: string;
}
interface ParLlaves {
  publicKey: LlaveCripto;
  privateKey: LlaveCripto;
}
declare const crypto: {
  subtle: {
    generateKey(
      alg: { name: string; namedCurve: string },
      extraible: boolean,
      usos: string[],
    ): Promise<ParLlaves>;
    exportKey(formato: string, llave: LlaveCripto): Promise<ArrayBuffer>;
    importKey(
      formato: string,
      datos: Uint8Array,
      alg: { name: string; namedCurve: string },
      extraible: boolean,
      usos: string[],
    ): Promise<LlaveCripto>;
    sign(
      alg: { name: string; hash: string },
      llave: LlaveCripto,
      datos: Uint8Array,
    ): Promise<ArrayBuffer>;
    verify(
      alg: { name: string; hash: string },
      llave: LlaveCripto,
      firma: Uint8Array,
      datos: Uint8Array,
    ): Promise<boolean>;
  };
};
declare const btoa: (s: string) => string;
declare const atob: (s: string) => string;
declare const TextEncoder: new () => { encode(s: string): Uint8Array };

export const DIFICULTAD = 2;
const CURVA = { name: 'ECDSA', namedCurve: 'P-256' };
const FIRMA = { name: 'ECDSA', hash: 'SHA-256' };

const aBase64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Verificador real (WebCrypto) para inyectar en verificarCadena. */
export const verificarFirmaReal: VerificadorFirma = async (llaveB64, mensaje, firmaB64) => {
  const llave = await crypto.subtle.importKey('spki', deBase64(llaveB64), CURVA, false, ['verify']);
  return crypto.subtle.verify(FIRMA, llave, deBase64(firmaB64), ascii(mensaje));
};

export interface Entorno {
  bloques: BloqueCadena[];
  opciones: OpcionesVerificacion;
  firmarUsuario(mensaje: string): Promise<string>;
  firmarSello(indice: number, hashCadena: string): Promise<Sello>;
}

export const clonar = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function persona(i: number): FilaPersona {
  return {
    cedula: `10000000${i}`,
    nombre: `Persona ${i}`,
    direccion_cifrada: `ZGlyZWNjaW9uLSR7aX0=${i}`,
    telefono_cifrado: `dGVsZWZvbm8tJHtpfQ==${i}`,
    creado_en: `2026-11-09T12:00:0${i}.000Z`,
    creado_por: 'registrador-1',
  };
}

/** Re-mina y re-encadena los bloques desde `desde`, recalculando hash_datos de cada fila. */
export function reencadenar(bloques: BloqueCadena[], desde: number): void {
  for (let i = desde; i < bloques.length; i++) {
    const b = bloques[i] as BloqueCadena;
    if (b.persona !== null) b.hash_datos = calcularHashDatos(b.persona);
    b.hash_anterior = i === 0 ? HASH_CERO : (bloques[i - 1] as BloqueCadena).hash_cadena;
    const r = minar(b.hash_anterior, b.hash_datos, DIFICULTAD);
    b.nonce = r.nonce;
    b.hash_cadena = r.hashCadena;
  }
}

/** Cadena válida de `n` bloques (génesis + n-1 personas firmadas) con sello del servidor. */
export async function crearEntorno(n = 5): Promise<Entorno> {
  const usuario = await crypto.subtle.generateKey(CURVA, true, ['sign', 'verify']);
  const servidor = await crypto.subtle.generateKey(CURVA, true, ['sign', 'verify']);
  const spki = async (k: LlaveCripto): Promise<string> =>
    aBase64(await crypto.subtle.exportKey('spki', k));
  const firmar = async (k: LlaveCripto, mensaje: string): Promise<string> =>
    aBase64(await crypto.subtle.sign(FIRMA, k, ascii(mensaje)));

  const bloques: BloqueCadena[] = [];
  for (let i = 0; i < n; i++) {
    const p = i === 0 ? null : persona(i);
    bloques.push({
      indice: i,
      hash_datos: p === null ? HASH_DATOS_GENESIS : calcularHashDatos(p),
      nonce: 0,
      hash_anterior: HASH_CERO,
      hash_cadena: HASH_CERO,
      firma_usuario: null,
      llave_id: i === 0 ? null : 1,
      persona: p,
    });
  }
  reencadenar(bloques, 0);
  for (const b of bloques) {
    if (b.persona !== null) b.firma_usuario = await firmar(usuario.privateKey, b.hash_datos);
  }

  const firmarSello = async (indice: number, hashCadena: string): Promise<Sello> => ({
    indice,
    hash_cadena: hashCadena,
    firma: await firmar(servidor.privateKey, `${indice}:${hashCadena}`),
  });
  const ultimo = bloques[n - 1] as BloqueCadena;
  const opciones: OpcionesVerificacion = {
    dificultad: DIFICULTAD,
    llavesUsuarios: { 1: await spki(usuario.publicKey) },
    verificarFirma: verificarFirmaReal,
    sello: await firmarSello(ultimo.indice, ultimo.hash_cadena),
    llavePublicaServidor: await spki(servidor.publicKey),
  };
  return {
    bloques,
    opciones,
    firmarUsuario: (m) => firmar(usuario.privateKey, m),
    firmarSello,
  };
}
