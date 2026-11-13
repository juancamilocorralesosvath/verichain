import { useEffect, useState } from 'react';
import { listarCadena, type BloqueApi } from '../api/cadena';
import { listarPersonas } from '../api/personas';
import { useSesion } from '../sesion';

import { Alerta, Hash, Tabla } from '../ui';

export { abreviarHash } from '../ui';

export function Cadena() {
  const { usuario } = useSesion();
  const [bloques, setBloques] = useState<BloqueApi[] | null>(null);
  const [firmantes, setFirmantes] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState('');
  // El admin recibe 403 en /personas: no se pide y su firmante sale "—".
  const puedeLeerPersonas = usuario?.rol === 'registrador' || usuario?.rol === 'auditor';

  useEffect(() => {
    let activo = true;
    listarCadena()
      .then((lista) => activo && setBloques(lista))
      .catch((e: unknown) => activo && setError(e instanceof Error ? e.message : 'Error'));
    if (puedeLeerPersonas) {
      listarPersonas()
        .then((lista) => activo && setFirmantes(new Map(lista.map((p) => [p.id, p.creado_por]))))
        .catch(() => undefined); // sin firmantes la cadena se sigue mostrando
    }
    return () => {
      activo = false;
    };
  }, [puedeLeerPersonas]);

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
        <Tabla etiqueta="Bloques de la cadena">
          <thead>
            <tr>
              <th>Índice</th>
              <th>Fecha</th>
              <th>Hash anterior</th>
              <th>Hash de datos</th>
              <th>Nonce</th>
              <th>Hash de cadena</th>
              <th>Firmante</th>
              <th>Llave</th>
            </tr>
          </thead>
          <tbody>
            {[...bloques]
              .sort((a, b) => a.indice - b.indice)
              .map((b) => (
                <tr key={b.indice} className={b.indice === 0 ? 'bloque genesis' : 'bloque'}>
                  <td>
                    {b.indice}
                    {b.indice === 0 && (
                      <>
                        {' '}
                        <strong>Génesis</strong>
                      </>
                    )}
                  </td>
                  <td>{b.creado_en}</td>
                  <td>
                    <Hash valor={b.hash_anterior} />
                  </td>
                  <td>
                    <Hash valor={b.hash_datos} />
                  </td>
                  <td>{b.nonce}</td>
                  <td>
                    <Hash valor={b.hash_cadena} />
                  </td>
                  <td>{(b.persona_id !== null && firmantes.get(b.persona_id)) || '—'}</td>
                  <td>{b.llave_id ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </Tabla>
      )}
    </main>
  );
}
