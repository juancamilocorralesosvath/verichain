import type { EstadoChequeo, ReporteCadena } from '@bc/core';

const SIMBOLO: Record<EstadoChequeo, string> = { ok: '✔', falla: '✘', 'no-aplica': '—' };

/** Informe legible en español: una fila por bloque con ✔/✘/— por chequeo, el sello y el veredicto. */
export function informeLegible(
  reporte: ReporteCadena,
  datos: { archivo: string; exportadoEn: string; dificultad: number; huellaFijada: string },
): string {
  const l: string[] = [];
  l.push(`Verificador independiente — ${datos.archivo}`);
  l.push(
    `Exportada: ${datos.exportadoEn} · Bloques: ${reporte.totalBloques} · Dificultad (según el archivo): ${datos.dificultad}`,
  );
  l.push(`Llave del servidor fijada: huella ${datos.huellaFijada}`);
  l.push('');
  l.push('Bloque  Datos  Enlace  Hash  PoW  Firma');
  for (const b of reporte.bloques) {
    const c = b.chequeos;
    l.push(
      `${String(b.indice).padStart(5)}   ${SIMBOLO[c.hashDatos]}      ${SIMBOLO[c.enlace]}       ${SIMBOLO[c.hashCadena]}     ${SIMBOLO[c.pow]}    ${SIMBOLO[c.firmaUsuario]}`,
    );
  }
  l.push('');
  const motivos = reporte.bloques.flatMap((b) => b.motivos.map((m) => `Bloque ${b.indice}: ${m}`));
  if (motivos.length > 0) {
    l.push('Motivos:');
    for (const m of motivos) l.push(`  ${m}`);
    l.push('');
  }
  const s = reporte.sello;
  l.push(
    s.estado === 'ok'
      ? `Sello del servidor: ${SIMBOLO.ok} válido`
      : s.estado === 'falla'
        ? `Sello del servidor: ${SIMBOLO.falla} ${s.motivos.join(' ')}`
        : `Sello del servidor: ${SIMBOLO['no-aplica']} no aplica`,
  );
  l.push('');
  l.push(
    reporte.valida
      ? 'VEREDICTO: CADENA ÍNTEGRA ✔'
      : `VEREDICTO: CADENA COMPROMETIDA ✘ (${
          reporte.primerBloqueRoto !== null
            ? `primer bloque roto: ${reporte.primerBloqueRoto}`
            : 'los bloques son coherentes entre sí, pero el sello del servidor no corresponde a la cadena'
        })`,
  );
  return l.join('\n') + '\n';
}
