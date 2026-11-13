import { useEffect, useState } from 'react';
import { leerBitacora, type PaginaBitacoraApi } from '../api/admin';
import { Alerta, Boton, Hash, Tabla } from '../ui';

export function Bitacora() {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaBitacoraApi | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    leerBitacora(pagina)
      .then((d) => {
        if (!activo) return;
        setDatos(d);
        setError('');
      })
      .catch((e: unknown) => activo && setError(e instanceof Error ? e.message : 'Error'));
    return () => {
      activo = false;
    };
  }, [pagina]);

  return (
    <main>
      <h1>Bitácora</h1>
      {error ? (
        <Alerta>{error}</Alerta>
      ) : datos === null ? (
        <p>Cargando la bitácora…</p>
      ) : (
        <>
          {datos.verificacion.valida ? (
            <Alerta tipo="info">✅ Bitácora íntegra: su cadena de hashes es válida.</Alerta>
          ) : (
            <Alerta>
              ❌ Bitácora alterada: su cadena de hashes se rompe en la entrada{' '}
              {datos.verificacion.primeraRota}.
            </Alerta>
          )}
          {datos.entradas.length === 0 ? (
            <p>No hay entradas.</p>
          ) : (
            <Tabla etiqueta="Entradas de la bitácora">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Resultado</th>
                  <th>IP</th>
                  <th>Detalle</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {datos.entradas.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fecha}</td>
                    <td>{e.usuario}</td>
                    <td>{e.accion}</td>
                    <td>{e.resultado}</td>
                    <td>{e.ip}</td>
                    <td>{e.detalle}</td>
                    <td>
                      <Hash valor={e.hash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <nav aria-label="Paginación de la bitácora">
            <Boton
              variante="secundario"
              disabled={datos.pagina <= 1}
              onClick={() => setPagina(datos.pagina - 1)}
            >
              Anterior
            </Boton>{' '}
            <span>
              Página {datos.pagina} de {datos.totalPaginas} ({datos.total} entradas)
            </span>{' '}
            <Boton
              variante="secundario"
              disabled={datos.pagina >= datos.totalPaginas}
              onClick={() => setPagina(datos.pagina + 1)}
            >
              Siguiente
            </Boton>
          </nav>
        </>
      )}
    </main>
  );
}
