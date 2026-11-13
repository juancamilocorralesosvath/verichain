import { useEffect, useState } from 'react';
import { descargarExportacion, llaveServidor, type LlaveServidorApi } from '../api/admin';
import { guardarArchivo } from '../descarga';
import { Alerta, Boton, Tarjeta } from '../ui';

export function Exportar() {
  const [llave, setLlave] = useState<LlaveServidorApi | null>(null);
  const [errorLlave, setErrorLlave] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let activo = true;
    llaveServidor()
      .then((l) => activo && setLlave(l))
      .catch((e: unknown) => activo && setErrorLlave(e instanceof Error ? e.message : 'Error'));
    return () => {
      activo = false;
    };
  }, []);

  async function exportar() {
    setError('');
    setAviso('');
    try {
      const { nombre, contenido } = await descargarExportacion();
      guardarArchivo(nombre, contenido, 'application/json');
      setAviso(`Descargado ${nombre}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible exportar');
    }
  }

  return (
    <main>
      <h1>Exportar</h1>
      <p>
        Descarga la cadena y la llave pública del servidor, y verifícalas fuera del sistema con el
        CLI (<code>npx verificador cadena.json --server-key server-public.pem</code>) o con el
        Verificador independiente.
      </p>
      <Tarjeta aria-label="Cadena">
        <h2>Cadena (JSON)</h2>
        <Boton onClick={() => void exportar()}>Descargar la cadena (JSON)</Boton>
        {error && <Alerta>{error}</Alerta>}
        {aviso && <Alerta tipo="info">{aviso}</Alerta>}
      </Tarjeta>
      <Tarjeta aria-label="Llave pública del servidor">
        <h2>Llave pública del servidor</h2>
        {errorLlave ? (
          <Alerta>{errorLlave}</Alerta>
        ) : llave === null ? (
          <p>Cargando la llave…</p>
        ) : (
          <>
            <p>Huella SHA-256 (compárala por un canal aparte):</p>
            <p>
              <code>{llave.huella_sha256}</code>
            </p>
            <Boton
              onClick={() =>
                guardarArchivo('server-public.pem', llave.pem, 'application/x-pem-file')
              }
            >
              Descargar server-public.pem
            </Boton>
          </>
        )}
      </Tarjeta>
    </main>
  );
}
