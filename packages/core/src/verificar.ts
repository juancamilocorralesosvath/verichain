import { calcularHashCadena, calcularHashDatos } from './hash.js';
import { HASH_CERO, HASH_DATOS_GENESIS } from './genesis.js';
import { cumpleDificultad } from './pow.js';
import type {
  BloqueCadena,
  EstadoChequeo,
  OpcionesVerificacion,
  ReporteBloque,
  ReporteCadena,
} from './tipos.js';

const estado = (cumple: boolean): EstadoChequeo => (cumple ? 'ok' : 'falla');

/**
 * Verifica toda la cadena recalculando los hashes en vivo (diseño §4, §5.4, §5.8).
 * Las firmas se verifican con `opciones.verificarFirma` (inyectada), así core no depende de Node.
 * Los bloques deben llegar ordenados por `indice`.
 */
export async function verificarCadena(
  bloques: BloqueCadena[],
  opciones: OpcionesVerificacion,
): Promise<ReporteCadena> {
  const reportes: ReporteBloque[] = [];

  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i] as BloqueCadena;
    const anterior = i > 0 ? (bloques[i - 1] as BloqueCadena) : null;
    const motivos: string[] = [];

    // hashDatos (se recalcula a partir de la fila actual)
    let hashDatosRecalculado = b.hash_datos;
    let hashDatos: EstadoChequeo;
    if (i === 0) {
      hashDatos = estado(b.hash_datos === HASH_DATOS_GENESIS);
      if (hashDatos === 'falla') motivos.push('El hash de datos del génesis no es el esperado');
    } else if (b.persona === null) {
      hashDatos = 'falla';
      motivos.push('Falta la fila de la persona: no se puede recalcular el hash de datos');
    } else {
      try {
        hashDatosRecalculado = calcularHashDatos(b.persona);
        hashDatos = estado(hashDatosRecalculado === b.hash_datos);
        if (hashDatos === 'falla') {
          motivos.push('Los datos de la persona no coinciden con el hash guardado (hash_datos)');
        }
      } catch {
        hashDatos = 'falla';
        motivos.push(
          'La fila de la persona está mal formada: no se puede calcular el hash de datos',
        );
      }
    }

    // enlace
    let enlace: EstadoChequeo;
    if (b.indice !== i) {
      enlace = 'falla';
      motivos.push(
        `El índice ${b.indice} no es el esperado (${i}): bloques fuera de orden o faltantes`,
      );
    } else if (anterior === null) {
      enlace = estado(b.hash_anterior === HASH_CERO);
      if (enlace === 'falla') motivos.push('El hash anterior del génesis no es 64 ceros (enlace)');
    } else {
      enlace = estado(b.hash_anterior === anterior.hash_cadena);
      if (enlace === 'falla') {
        motivos.push(
          'El hash anterior no coincide con el hash de cadena del bloque previo (enlace)',
        );
      }
    }

    // hashCadena
    let hashCadena: EstadoChequeo;
    try {
      hashCadena = estado(
        calcularHashCadena(b.hash_anterior, hashDatosRecalculado, b.nonce) === b.hash_cadena,
      );
    } catch {
      hashCadena = 'falla';
    }
    if (hashCadena === 'falla') {
      motivos.push('El hash de cadena recalculado no coincide con el guardado (hash_cadena)');
    }

    // pow
    const pow = estado(cumpleDificultad(b.hash_cadena, opciones.dificultad));
    if (pow === 'falla') {
      motivos.push(
        `El hash de cadena no cumple la prueba de trabajo (${opciones.dificultad} ceros)`,
      );
    }

    // firmaUsuario
    let firmaUsuario: EstadoChequeo = 'no-aplica';
    if (i > 0 && opciones.verificarFirma) {
      const llave = b.llave_id === null ? undefined : opciones.llavesUsuarios[b.llave_id];
      if (b.firma_usuario === null) {
        firmaUsuario = 'falla';
        motivos.push('El bloque no trae la firma del usuario (firma_usuario)');
      } else if (llave === undefined) {
        firmaUsuario = 'falla';
        motivos.push('No existe la llave pública del firmante (llave_id)');
      } else {
        let valida: boolean;
        try {
          valida = await opciones.verificarFirma(llave, b.hash_datos, b.firma_usuario);
        } catch {
          valida = false;
        }
        firmaUsuario = estado(valida);
        if (!valida)
          motivos.push('La firma del usuario no es válida para este bloque (firma_usuario)');
      }
    }

    reportes.push({
      indice: b.indice,
      chequeos: { hashDatos, enlace, hashCadena, pow, firmaUsuario },
      motivos,
    });
  }

  // sello del servidor
  const sello: ReporteCadena['sello'] = { estado: 'no-aplica', motivos: [] };
  const s = opciones.sello;
  if (s && opciones.verificarFirma && opciones.llavePublicaServidor) {
    const ultimo = bloques[bloques.length - 1];
    let ok = true;
    if (!ultimo) {
      ok = false;
      sello.motivos.push('La cadena está vacía pero existe un sello del servidor');
    } else if (s.indice > ultimo.indice) {
      ok = false;
      sello.motivos.push(
        `Truncamiento: el sello corresponde al bloque ${s.indice} pero la cadena termina en el bloque ${ultimo.indice}`,
      );
    } else if (s.indice !== ultimo.indice || s.hash_cadena !== ultimo.hash_cadena) {
      ok = false;
      sello.motivos.push('El último bloque no coincide con el sello del servidor');
    }
    let firmaValida: boolean;
    try {
      firmaValida = await opciones.verificarFirma(
        opciones.llavePublicaServidor,
        `${s.indice}:${s.hash_cadena}`,
        s.firma,
      );
    } catch {
      firmaValida = false;
    }
    if (!firmaValida) {
      ok = false;
      sello.motivos.push('La firma del sello del servidor no es válida');
    }
    sello.estado = estado(ok);
  }

  const rotos = reportes.filter((r) => Object.values(r.chequeos).includes('falla'));
  const primerBloqueRoto = rotos.length > 0 ? Math.min(...rotos.map((r) => r.indice)) : null;
  return {
    valida: rotos.length === 0 && sello.estado !== 'falla',
    primerBloqueRoto,
    bloques: reportes,
    sello,
    totalBloques: bloques.length,
  };
}
