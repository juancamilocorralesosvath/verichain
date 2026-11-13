import type { EstadoChequeo, ReporteBloque, ReporteCadena } from '@bc/core';

const ETIQUETAS: { clave: keyof ReporteBloque['chequeos']; nombre: string }[] = [
  { clave: 'hashDatos', nombre: 'Hash de datos' },
  { clave: 'enlace', nombre: 'Enlace con el anterior' },
  { clave: 'hashCadena', nombre: 'Hash de cadena' },
  { clave: 'pow', nombre: 'Prueba de trabajo' },
  { clave: 'firmaUsuario', nombre: 'Firma del usuario' },
];

const TEXTO_ESTADO: Record<EstadoChequeo, string> = {
  ok: '✅ ok',
  falla: '❌ falla',
  'no-aplica': '➖ no aplica',
};

const Estado = ({ estado }: { estado: EstadoChequeo }) => (
  <span data-estado={estado}>{TEXTO_ESTADO[estado]}</span>
);

/**
 * Muestra un `ReporteCadena`. No hace `fetch`: lo reutilizan la página Verificar,
 * el verificador local (H8.2) y las páginas de ataques y cadena.
 */
export function ReporteVerificacion({ reporte }: { reporte: ReporteCadena }) {
  const roto = reporte.primerBloqueRoto;
  return (
    <section aria-label="Reporte de verificación">
      <div role="status" data-valida={reporte.valida} className="veredicto">
        <h2>{reporte.valida ? '✅ Cadena íntegra' : '❌ Cadena comprometida'}</h2>
        <p>
          {reporte.totalBloques} {reporte.totalBloques === 1 ? 'bloque' : 'bloques'} revisados.
        </p>
        {roto !== null && (
          <p>
            Primer bloque roto: {roto}. <a href={`#bloque-${roto}`}>Ir al bloque {roto}</a>
          </p>
        )}
        {!reporte.valida && roto === null && (
          <p>Ningún bloque falla por sí solo, pero el sello del servidor no es válido.</p>
        )}
      </div>

      <section aria-label="Sello del servidor" data-estado={reporte.sello.estado}>
        <h3>Sello del servidor</h3>
        <p>
          <Estado estado={reporte.sello.estado} />
        </p>
        {reporte.sello.motivos.length > 0 && (
          <ul>
            {reporte.sello.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </section>

      <h3>Bloques</h3>
      {reporte.bloques.map((b) => {
        const esRoto = b.indice === roto;
        return (
          <article
            key={b.indice}
            id={`bloque-${b.indice}`}
            data-bloque={b.indice}
            data-roto={esRoto ? 'true' : undefined}
            aria-label={`Bloque ${b.indice}`}
          >
            <h4>
              Bloque {b.indice}
              {esRoto && ' — primer bloque roto'}
            </h4>
            <ul>
              {ETIQUETAS.map(({ clave, nombre }) => (
                <li key={clave}>
                  {nombre}: <Estado estado={b.chequeos[clave]} />
                </li>
              ))}
            </ul>
            {b.motivos.length > 0 && (
              <ul>
                {b.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}
