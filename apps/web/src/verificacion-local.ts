import {
  aOpcionesVerificacion,
  parsearExportacion,
  verificarCadena,
  type ReporteCadena,
} from '@bc/core';
import { huellaSpkiHexDe, pemASpki } from './cripto/pem';
import { verificarFirmaWeb } from './cripto/verificador-firma.web';

export interface ResultadoLocal {
  reporte: ReporteCadena;
  dificultad: number;
  exportadoEn: string;
  huellaFijada: string;
  /** Texto de advertencia si la huella fijada no coincide con la del archivo; si no, null. */
  advertenciaHuella: string | null;
}

/**
 * Verifica una exportación `bc-export/1` íntegramente en el navegador. No usa la red: solo
 * `@bc/core` y WebCrypto. La llave del servidor es SIEMPRE la fijada (PEM aparte); la del archivo
 * solo se compara por su huella. Sin sello en el archivo la cadena no se da por íntegra.
 */
export async function verificarLocal(textoJson: string, textoPem: string): Promise<ResultadoLocal> {
  let json: unknown;
  try {
    json = JSON.parse(textoJson);
  } catch {
    throw new Error('El archivo de la cadena no es JSON válido');
  }
  const exportacion = parsearExportacion(json);
  const spkiFijada = pemASpki(textoPem);
  const huellaFijada = await huellaSpkiHexDe(spkiFijada);

  let reporte = await verificarCadena(
    exportacion.bloques,
    aOpcionesVerificacion(exportacion, {
      verificarFirma: verificarFirmaWeb,
      llavePublicaServidor: spkiFijada,
    }),
  );
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
  return {
    reporte,
    dificultad: exportacion.dificultad,
    exportadoEn: exportacion.exportado_en,
    huellaFijada,
    advertenciaHuella:
      huellaFijada === exportacion.huella_llave_servidor
        ? null
        : `La huella de la llave fijada no coincide con la del archivo. Se usó la fijada (${huellaFijada}); la del archivo es ${exportacion.huella_llave_servidor}. Si no la esperabas, desconfía de este archivo.`,
  };
}
