import { useCallback, useEffect, useState } from 'react';
import {
  aprobarLlave,
  llavesPendientes,
  rechazarLlave,
  type LlavePendienteApi,
} from '../api/admin';
import { huellaSpkiHex } from '../cripto/llaves';
import { Alerta, Boton, Tabla } from '../ui';

const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

/** SHA-256 del SPKI (primeros 32 hex, igual que "Mi llave"); el valor completo va en el tooltip. */
function Huella({ spki }: { spki: string }) {
  const [huella, setHuella] = useState('');
  useEffect(() => {
    let activo = true;
    huellaSpkiHex(spki)
      .then((h) => activo && setHuella(h))
      .catch(() => activo && setHuella('no disponible'));
    return () => {
      activo = false;
    };
  }, [spki]);
  return huella ? <code title={huella}>{huella.slice(0, 32)}</code> : <span>Calculando…</span>;
}

export function Llaves() {
  const [llaves, setLlaves] = useState<LlavePendienteApi[] | null>(null);
  const [error, setError] = useState('');
  const [errorAccion, setErrorAccion] = useState('');

  const cargar = useCallback(async () => {
    try {
      setLlaves(await llavesPendientes());
      setError('');
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(accion: (id: number) => Promise<unknown>, id: number) {
    setErrorAccion('');
    try {
      await accion(id);
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    }
    await cargar();
  }

  return (
    <main>
      <h1>Llaves pendientes</h1>
      <p>
        Antes de aprobar, compara la huella con la que el usuario ve en <strong>Mi llave</strong>:
        quien aprueba una llave falsa podría firmar en nombre de otro.
      </p>
      {errorAccion && <Alerta>{errorAccion}</Alerta>}
      {error ? (
        <Alerta>{error}</Alerta>
      ) : llaves === null ? (
        <p>Cargando llaves…</p>
      ) : llaves.length === 0 ? (
        <p>No hay llaves pendientes.</p>
      ) : (
        <Tabla etiqueta="Llaves pendientes">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Versión</th>
              <th>Huella SHA-256</th>
              <th>Registrada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {llaves.map((l) => (
              <tr key={l.id}>
                <td>{l.username}</td>
                <td>{l.version}</td>
                <td>
                  <Huella spki={l.spki_b64} />
                </td>
                <td>{l.creado_en}</td>
                <td>
                  <Boton
                    aria-label={`Aprobar la llave de ${l.username}`}
                    onClick={() => void resolver(aprobarLlave, l.id)}
                  >
                    Aprobar
                  </Boton>
                  <Boton
                    variante="peligro"
                    aria-label={`Rechazar la llave de ${l.username}`}
                    onClick={() => void resolver(rechazarLlave, l.id)}
                  >
                    Rechazar
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </main>
  );
}
