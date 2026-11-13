import { useState } from 'react';
import { ReporteVerificacion } from '../componentes/ReporteVerificacion';
import { verificarLocal, type ResultadoLocal } from '../verificacion-local';

const MAX_BYTES = 10 * 1024 * 1024;

async function leerTexto(archivo: File): Promise<string> {
  if (archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" es demasiado grande`);
  return archivo.text();
}

export function VerificadorLocal() {
  const [cadena, setCadena] = useState<File | null>(null);
  const [llave, setLlave] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoLocal | null>(null);
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);

  async function verificar() {
    if (!cadena || !llave) return;
    setVerificando(true);
    setError('');
    setResultado(null);
    try {
      setResultado(await verificarLocal(await leerTexto(cadena), await leerTexto(llave)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible verificar');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <main>
      <h1>Verificador independiente</h1>
      <p>
        Verifica la cadena exportada aquí mismo, en tu navegador: los archivos no se envían a ningún
        servidor. No hace falta confiar en el servidor para comprobar la integridad.
      </p>
      <label>
        Archivo de la cadena (cadena.json){' '}
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => setCadena(e.target.files?.[0] ?? null)}
        />
      </label>
      <label>
        Llave pública del servidor (server-public.pem){' '}
        <input
          type="file"
          accept=".pem,text/plain"
          onChange={(e) => setLlave(e.target.files?.[0] ?? null)}
        />
      </label>
      <button onClick={() => void verificar()} disabled={!cadena || !llave || verificando}>
        Verificar localmente
      </button>
      {verificando && <p>Verificando…</p>}
      {error && <p role="alert">{error}</p>}
      {resultado?.advertenciaHuella && <p role="alert">{resultado.advertenciaHuella}</p>}
      {resultado && (
        <>
          <p>
            Dificultad de prueba de trabajo (del archivo): {resultado.dificultad}. Exportado el{' '}
            {resultado.exportadoEn}. Huella de la llave fijada:{' '}
            <code>{resultado.huellaFijada}</code>
          </p>
          <ReporteVerificacion reporte={resultado.reporte} />
        </>
      )}
      {!resultado && !error && !verificando && <p>Elige los dos archivos para empezar.</p>}
    </main>
  );
}
