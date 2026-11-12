import { CAMPOS_PERSONA } from './tipos.js';
import type {
  BloqueCadena,
  FilaPersona,
  OpcionesVerificacion,
  Sello,
  VerificadorFirma,
} from './tipos.js';

/** Formato de la exportación para el verificador independiente (diseño §5.9). */
export const FORMATO_EXPORTACION = 'bc-export/1';

export interface Exportacion {
  formato: typeof FORMATO_EXPORTACION;
  exportado_en: string;
  dificultad: number;
  bloques: BloqueCadena[];
  /** llave_id (como texto) → llave pública SPKI DER en base64. */
  llaves_usuarios: Record<string, string>;
  sello: Sello | null;
  /** Solo para comparar: el verificador usa la llave del servidor que fijó el usuario. */
  llave_servidor_spki_b64: string;
  /** SHA-256 hex del SPKI DER de la llave del servidor. */
  huella_llave_servidor: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function invalida(motivo: string): never {
  throw new Error(`Exportación inválida: ${motivo}`);
}
const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const esEntero = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

function texto(x: unknown, campo: string): string {
  if (typeof x !== 'string' || x === '') invalida(`"${campo}" debe ser un texto no vacío`);
  return x;
}
function hex64(x: unknown, campo: string): string {
  if (typeof x !== 'string' || !HEX64.test(x))
    invalida(`"${campo}" debe ser un hash de 64 caracteres hex en minúsculas`);
  return x;
}
function base64(x: unknown, campo: string): string {
  if (typeof x !== 'string' || !BASE64.test(x)) invalida(`"${campo}" debe ser base64`);
  return x;
}

function parsearPersona(x: unknown, donde: string): FilaPersona {
  if (!esObjeto(x)) invalida(`${donde}.persona debe ser un objeto o null`);
  const claves = Object.keys(x);
  for (const campo of CAMPOS_PERSONA) {
    if (typeof x[campo] !== 'string') invalida(`${donde}.persona.${campo} debe ser un texto`);
  }
  const extra = claves.find((c) => !(CAMPOS_PERSONA as readonly string[]).includes(c));
  if (extra !== undefined) invalida(`${donde}.persona tiene un campo no permitido ("${extra}")`);
  return Object.fromEntries(CAMPOS_PERSONA.map((c) => [c, x[c] as string])) as FilaPersona;
}

function parsearBloque(x: unknown, i: number): BloqueCadena {
  const donde = `bloques[${i}]`;
  if (!esObjeto(x)) invalida(`${donde} debe ser un objeto`);
  if (!esEntero(x['indice']) || x['indice'] < 0)
    invalida(`${donde}.indice debe ser un entero >= 0`);
  if (!esEntero(x['nonce']) || x['nonce'] < 0) invalida(`${donde}.nonce debe ser un entero >= 0`);
  const firma = x['firma_usuario'];
  if (firma !== null && (typeof firma !== 'string' || !BASE64.test(firma))) {
    invalida(`${donde}.firma_usuario debe ser base64 o null`);
  }
  const llave = x['llave_id'];
  if (llave !== null && (!esEntero(llave) || llave < 1))
    invalida(`${donde}.llave_id debe ser un entero positivo o null`);
  return {
    indice: x['indice'],
    hash_datos: hex64(x['hash_datos'], `${donde}.hash_datos`),
    nonce: x['nonce'],
    hash_anterior: hex64(x['hash_anterior'], `${donde}.hash_anterior`),
    hash_cadena: hex64(x['hash_cadena'], `${donde}.hash_cadena`),
    firma_usuario: firma,
    llave_id: llave,
    persona: x['persona'] === null ? null : parsearPersona(x['persona'], donde),
  };
}

/**
 * Valida la estructura de una exportación y la devuelve tipada. No verifica la cadena (eso lo hace
 * `verificarCadena`): solo comprueba que el JSON tiene la forma esperada. Si no, lanza un error claro.
 */
export function parsearExportacion(json: unknown): Exportacion {
  if (!esObjeto(json)) invalida('el contenido debe ser un objeto JSON');
  if (json['formato'] !== FORMATO_EXPORTACION) {
    invalida(`formato desconocido (se esperaba "${FORMATO_EXPORTACION}")`);
  }
  texto(json['exportado_en'], 'exportado_en');
  const dificultad = json['dificultad'];
  if (!esEntero(dificultad) || dificultad < 0 || dificultad > 8)
    invalida('"dificultad" debe ser un entero entre 0 y 8');
  if (!Array.isArray(json['bloques']) || json['bloques'].length === 0)
    invalida('"bloques" debe ser una lista no vacía');
  const bloques = json['bloques'].map((b: unknown, i: number) => parsearBloque(b, i));

  const crudas = json['llaves_usuarios'];
  if (!esObjeto(crudas)) invalida('"llaves_usuarios" debe ser un objeto');
  const llaves_usuarios: Record<string, string> = {};
  for (const [id, spki] of Object.entries(crudas)) {
    if (!/^[1-9]\d*$/.test(id)) invalida(`llaves_usuarios: el id "${id}" no es un entero positivo`);
    llaves_usuarios[id] = base64(spki, `llaves_usuarios.${id}`);
  }

  let sello: Sello | null = null;
  if (json['sello'] !== null) {
    const s = json['sello'];
    if (!esObjeto(s)) invalida('"sello" debe ser un objeto o null');
    if (!esEntero(s['indice']) || s['indice'] < 0)
      invalida('"sello.indice" debe ser un entero >= 0');
    sello = {
      indice: s['indice'],
      hash_cadena: hex64(s['hash_cadena'], 'sello.hash_cadena'),
      firma: base64(s['firma'], 'sello.firma'),
    };
  }

  return {
    formato: FORMATO_EXPORTACION,
    exportado_en: json['exportado_en'] as string,
    dificultad,
    bloques,
    llaves_usuarios,
    sello,
    llave_servidor_spki_b64: base64(json['llave_servidor_spki_b64'], 'llave_servidor_spki_b64'),
    huella_llave_servidor: hex64(json['huella_llave_servidor'], 'huella_llave_servidor'),
  };
}

/**
 * Arma las opciones de `verificarCadena` a partir de una exportación. La llave del servidor es
 * **obligatoria y la fija quien verifica** (archivo aparte): la del JSON no se usa, porque quien
 * pudo alterar la cadena también pudo cambiar esa llave (diseño §7b).
 */
export function aOpcionesVerificacion(
  exportacion: Exportacion,
  fijado: { verificarFirma: VerificadorFirma; llavePublicaServidor: string },
): OpcionesVerificacion {
  if (!fijado.llavePublicaServidor) {
    throw new Error(
      'Falta la llave del servidor fijada por quien verifica (no se usa la del archivo)',
    );
  }
  return {
    dificultad: exportacion.dificultad,
    llavesUsuarios: Object.fromEntries(
      Object.entries(exportacion.llaves_usuarios).map(([id, spki]) => [Number(id), spki]),
    ),
    verificarFirma: fijado.verificarFirma,
    sello: exportacion.sello,
    llavePublicaServidor: fijado.llavePublicaServidor,
  };
}
