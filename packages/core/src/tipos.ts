/** Campos de una fila de persona, en el orden canónico (no cambiar sin actualizar el diseño). */
export const CAMPOS_PERSONA = [
  'cedula',
  'nombre',
  'direccion_cifrada',
  'telefono_cifrado',
  'creado_en',
  'creado_por',
] as const;

export type FilaPersona = Record<(typeof CAMPOS_PERSONA)[number], string>;

export interface BloqueCadena {
  indice: number; // 0 = génesis
  hash_datos: string; // guardado
  nonce: number;
  hash_anterior: string;
  hash_cadena: string;
  /** base64 de la firma ECDSA P-256 en formato IEEE-P1363 (r||s, 64 bytes); null en génesis. */
  firma_usuario: string | null;
  llave_id: number | null;
  /** Fila ACTUAL de la tabla personas (null en génesis). */
  persona: FilaPersona | null;
}

/** Firma base64 P1363 del servidor sobre `${indice}:${hash_cadena}`. */
export interface Sello {
  indice: number;
  hash_cadena: string;
  firma: string;
}

/** Verifica una firma ECDSA P-256. La inyecta cada consumidor (node:crypto, WebCrypto). */
export type VerificadorFirma = (
  llavePublicaSpkiB64: string,
  mensaje: string,
  firmaB64: string,
) => Promise<boolean>;

export interface OpcionesVerificacion {
  dificultad: number;
  /** llave_id → llave pública SPKI DER en base64. */
  llavesUsuarios: Record<number, string>;
  /** Si falta, los chequeos de firma quedan en 'no-aplica'. */
  verificarFirma?: VerificadorFirma;
  sello?: Sello | null;
  /** SPKI DER en base64. */
  llavePublicaServidor?: string;
}

export type EstadoChequeo = 'ok' | 'falla' | 'no-aplica';

export interface ReporteBloque {
  indice: number;
  chequeos: {
    hashDatos: EstadoChequeo;
    enlace: EstadoChequeo;
    hashCadena: EstadoChequeo;
    pow: EstadoChequeo;
    firmaUsuario: EstadoChequeo;
  };
  /** En español claro. */
  motivos: string[];
}

export interface ReporteCadena {
  valida: boolean;
  primerBloqueRoto: number | null;
  bloques: ReporteBloque[];
  sello: { estado: EstadoChequeo; motivos: string[] };
  totalBloques: number;
}
