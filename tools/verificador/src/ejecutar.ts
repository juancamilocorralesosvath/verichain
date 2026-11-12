import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  aOpcionesVerificacion,
  parsearExportacion,
  verificarCadena,
  type ReporteCadena,
} from '@bc/core';
import { informeLegible } from './informe.js';
import { leerLlaveFijada } from './llave.js';
import { verificarFirmaNode } from './verificador-firma.js';

export interface Io {
  out: (texto: string) => void;
  err: (texto: string) => void;
}

const USO = `Uso: verificador <cadena.json> --server-key <server-public.pem> [--json]

Verifica una cadena exportada sin confiar en el servidor: recalcula los hashes, el PoW, las firmas
de los usuarios y el sello del servidor. La llave del servidor se fija con --server-key; la que trae
el JSON solo se compara con ella.

Opciones:
  -k, --server-key <pem>   llave pública del servidor (PEM), obtenida por un canal aparte
      --json               imprime el reporte crudo (JSON) en lugar del informe legible
  -h, --help               muestra esta ayuda

Código de salida: 0 si la cadena es íntegra, 1 si no lo es, 2 si hay un error de uso o de archivo.
`;

const leer = (ruta: string): string => {
  try {
    return readFileSync(ruta, 'utf8');
  } catch (e) {
    throw new Error(`No se pudo leer "${ruta}": ${(e as Error).message}`, { cause: e });
  }
};

/** Lógica del CLI sin tocar `process`: devuelve el código de salida (0 íntegra, 1 no, 2 error). */
export async function ejecutar(argv: string[], io: Io): Promise<number> {
  let args: {
    values: { 'server-key'?: string; json?: boolean; help?: boolean };
    positionals: string[];
  };
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: OPCIONES });
  } catch (e) {
    io.err(`Opción no válida: ${(e as Error).message}\n\n${USO}`);
    return 2;
  }
  if (args.values.help) {
    io.out(USO);
    return 0;
  }
  const [archivo, ...resto] = args.positionals;
  if (archivo === undefined || resto.length > 0) {
    io.err(`Uso incorrecto: se espera exactamente un archivo de cadena.\n\n${USO}`);
    return 2;
  }
  const rutaLlave = args.values['server-key'];
  if (!rutaLlave) {
    io.err(
      `Falta --server-key <server-public.pem>: hay que fijar la llave del servidor.\n\n${USO}`,
    );
    return 2;
  }

  try {
    let json: unknown;
    const texto = leer(archivo);
    try {
      json = JSON.parse(texto);
    } catch (e) {
      throw new Error(`El archivo "${archivo}" no es JSON válido: ${(e as Error).message}`, {
        cause: e,
      });
    }
    const exportacion = parsearExportacion(json);
    const fijada = leerLlaveFijada(leer(rutaLlave));

    // La llave que se usa es SIEMPRE la fijada; la del archivo solo se compara por su huella.
    if (fijada.huella !== exportacion.huella_llave_servidor) {
      io.err(
        'ADVERTENCIA: la llave del servidor fijada no coincide con la que trae el archivo.\n' +
          `  huella fijada (la que se usa): ${fijada.huella}\n` +
          `  huella del archivo:            ${exportacion.huella_llave_servidor}\n` +
          '  Se verifica con la llave fijada; si no la esperabas, desconfía de este archivo.\n',
      );
    }

    let reporte: ReporteCadena = await verificarCadena(
      exportacion.bloques,
      aOpcionesVerificacion(exportacion, {
        verificarFirma: verificarFirmaNode,
        llavePublicaServidor: fijada.spkiB64,
      }),
    );
    // Sin sello no se puede dar por íntegra: si no, quitarlo silenciaría la detección.
    if (!exportacion.sello) {
      reporte = {
        ...reporte,
        valida: false,
        sello: {
          estado: 'falla',
          motivos: [
            'El archivo no trae el sello del servidor: la cadena no se puede dar por íntegra',
          ],
        },
      };
    }

    io.out(
      args.values.json
        ? JSON.stringify(reporte, null, 2) + '\n'
        : informeLegible(reporte, {
            archivo,
            exportadoEn: exportacion.exportado_en,
            dificultad: exportacion.dificultad,
            huellaFijada: fijada.huella,
          }),
    );
    return reporte.valida ? 0 : 1;
  } catch (e) {
    io.err(`Error: ${(e as Error).message}\n`);
    return 2;
  }
}

const OPCIONES = {
  'server-key': { type: 'string', short: 'k' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;
