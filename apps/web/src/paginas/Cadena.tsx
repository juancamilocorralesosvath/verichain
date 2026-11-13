import type { ReporteCadena } from '@bc/core';
import { useEffect, useState } from 'react';
import { listarCadena, verificarCadena, type BloqueApi } from '../api/cadena';
import { listarPersonas } from '../api/personas';
import { useSesion } from '../sesion';
import { Alerta, Boton, Hash, Insignia } from '../ui';

export { abreviarHash } from '../ui';

type EstadoBloque = 'sin-verificar' | 'ok' | 'falla';

const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : 'Error');

/** Un bloque está en falla si cualquiera de sus chequeos falla; "no aplica" no cuenta. */
function estadoDe(reporte: ReporteCadena | null, indice: number): EstadoBloque {
  if (!reporte) return 'sin-verificar';
  const b = reporte.bloques.find((x) => x.indice === indice);
  if (!b) return 'sin-verificar';
  return Object.values(b.chequeos).includes('falla') ? 'falla' : 'ok';
}

export function Cadena() {
  const { usuario } = useSesion();
  const [bloques, setBloques] = useState<BloqueApi[] | null>(null);
  const [firmantes, setFirmantes] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState('');
  const [reporte, setReporte] = useState<ReporteCadena | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [errorVerificar, setErrorVerificar] = useState('');
  // El admin recibe 403 en /personas: no se pide y su firmante sale "—".
  const puedeLeerPersonas = usuario?.rol === 'registrador' || usuario?.rol === 'auditor';
  const puedeVerificar = usuario?.rol === 'admin' || usuario?.rol === 'auditor';

  useEffect(() => {
    let activo = true;
    listarCadena()
      .then((lista) => activo && setBloques(lista))
      .catch((e: unknown) => activo && setError(mensajeDe(e)));
    if (puedeLeerPersonas) {
      listarPersonas()
        .then((lista) => activo && setFirmantes(new Map(lista.map((p) => [p.id, p.creado_por]))))
        .catch(() => undefined); // sin firmantes la cadena se sigue mostrando
    }
    return () => {
      activo = false;
    };
  }, [puedeLeerPersonas]);

  async function verificar() {
    setVerificando(true);
    setErrorVerificar('');
    try {
      setReporte(await verificarCadena());
    } catch (e) {
      setReporte(null);
      setErrorVerificar(mensajeDe(e));
    } finally {
      setVerificando(false);
    }
  }

  const ordenados = bloques ? [...bloques].sort((a, b) => a.indice - b.indice) : [];

  return (
    <main>
      <h1>Cadena</h1>
      {error ? (
        <Alerta>{error}</Alerta>
      ) : bloques === null ? (
        <p>Cargando la cadena…</p>
      ) : bloques.length === 0 ? (
        <p>No hay bloques.</p>
      ) : (
        <>
          {puedeVerificar && (
            <p>
              <Boton onClick={() => void verificar()} disabled={verificando}>
                Verificar cadena
              </Boton>
            </p>
          )}
          {verificando && <p>Verificando la cadena…</p>}
          {errorVerificar && <Alerta>{errorVerificar}</Alerta>}
          {reporte && (
            <Alerta tipo={reporte.valida ? 'info' : 'error'}>
              {reporte.valida
                ? '✅ Cadena íntegra.'
                : reporte.primerBloqueRoto !== null
                  ? `❌ Cadena comprometida: el primer bloque roto es el ${reporte.primerBloqueRoto}.`
                  : '❌ Cadena comprometida: ningún bloque falla por sí solo, pero el sello del servidor no es válido.'}
            </Alerta>
          )}
          <div
            className="cadena-scroll"
            role="region"
            aria-label="Recorrido de la cadena"
            tabIndex={0}
          >
            <ol className="cadena" aria-label="Bloques de la cadena">
              {ordenados.map((b, i) => {
                const estado = estadoDe(reporte, b.indice);
                const enlaceRoto =
                  i > 0 &&
                  reporte?.bloques.find((x) => x.indice === b.indice)?.chequeos.enlace === 'falla';
                // una conexión toca a un bloque en falla si es la de entrada o la de salida de ese bloque
                const afectada =
                  i > 0 &&
                  (estado === 'falla' ||
                    estadoDe(reporte, ordenados[i - 1]?.indice ?? -1) === 'falla');
                return (
                  <li key={b.indice}>
                    {i > 0 && (
                      <div
                        className="conexion"
                        data-conexion={b.indice}
                        data-roto={enlaceRoto ? 'true' : undefined}
                        data-afectada={afectada ? 'true' : undefined}
                      >
                        <span aria-hidden="true">↓</span>
                        <span className="conexion-texto">
                          {enlaceRoto
                            ? `Enlace roto: el hash anterior del bloque ${b.indice} no coincide`
                            : `hash anterior del bloque ${b.indice} = hash de cadena del bloque ${ordenados[i - 1]?.indice}`}
                        </span>
                      </div>
                    )}
                    <article
                      className="bloque"
                      data-bloque={b.indice}
                      data-estado={estado}
                      data-genesis={b.indice === 0 ? 'true' : undefined}
                      aria-label={`Bloque ${b.indice}`}
                    >
                      <header>
                        <h2>
                          Bloque {b.indice}
                          {b.indice === 0 && (
                            <>
                              {' '}
                              <strong>Génesis</strong>
                            </>
                          )}
                        </h2>
                        {estado !== 'sin-verificar' && <Insignia estado={estado} />}
                      </header>
                      <dl>
                        <dt>Hash anterior</dt>
                        <dd>
                          <Hash valor={b.hash_anterior} />
                        </dd>
                        <dt>Hash de datos</dt>
                        <dd>
                          <Hash valor={b.hash_datos} />
                        </dd>
                        <dt>Nonce</dt>
                        <dd>{b.nonce}</dd>
                        <dt>Hash de cadena</dt>
                        <dd>
                          <Hash valor={b.hash_cadena} />
                        </dd>
                        <dt>Firmante</dt>
                        <dd>{(b.persona_id !== null && firmantes.get(b.persona_id)) || '—'}</dd>
                        <dt>Llave</dt>
                        <dd>{b.llave_id ?? '—'}</dd>
                        <dt>Fecha</dt>
                        <dd>{b.creado_en}</dd>
                      </dl>
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </main>
  );
}
