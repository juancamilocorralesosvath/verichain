import { useEffect, useState } from 'react';
import { guardarPar, leerPar } from '../cripto/almacen';
import {
  ErrorRespaldo,
  crearRespaldo,
  exportarPublicaSpkiB64,
  generarPar,
  huellaSpkiHex,
  importarRespaldo,
  type ParLlaves,
} from '../cripto/llaves';
import { useSesion } from '../sesion';

const mensajeDe = (e: unknown): string =>
  e instanceof ErrorRespaldo ? e.message : 'No fue posible completar la operación';

const leerTexto = (archivo: File): Promise<string> =>
  new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
    lector.readAsText(archivo);
  });

export function MiLlave() {
  const { usuario } = useSesion();
  const username = usuario?.username ?? '';
  const [cargando, setCargando] = useState(true);
  const [par, setPar] = useState<ParLlaves | null>(null);
  const [spki, setSpki] = useState('');
  const [huella, setHuella] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [passwordRespaldo, setPasswordRespaldo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [passwordImportar, setPasswordImportar] = useState('');

  async function mostrar(nuevo: ParLlaves | null) {
    setPar(nuevo);
    if (!nuevo) {
      setSpki('');
      setHuella('');
      return;
    }
    const valor = await exportarPublicaSpkiB64(nuevo.publica);
    setSpki(valor);
    setHuella((await huellaSpkiHex(valor)).slice(0, 32));
  }

  useEffect(() => {
    let activo = true;
    leerPar(username)
      .then(async (guardado) => {
        if (activo) await mostrar(guardado);
      })
      .catch(() => activo && setError('No fue posible leer la llave guardada en este navegador'))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [username]);

  async function generar() {
    setError('');
    setAviso('');
    try {
      const nuevo = await generarPar();
      await guardarPar(username, nuevo);
      await mostrar(nuevo);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  async function descargar() {
    setError('');
    setAviso('');
    if (!par) return;
    try {
      const respaldo = await crearRespaldo(par, passwordRespaldo);
      const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `respaldo-llave-${username}.json`;
      enlace.click();
      URL.revokeObjectURL(url);
      setPasswordRespaldo('');
      setAviso('Respaldo generado. Guárdalo en un lugar seguro y no olvides su contraseña.');
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  async function importar() {
    setError('');
    setAviso('');
    if (!archivo) {
      setError('Elige un archivo de respaldo');
      return;
    }
    if (
      par &&
      !window.confirm(
        'Esto reemplaza la llave de este navegador. Si no tienes un respaldo, la perderás. ¿Continuar?',
      )
    ) {
      return;
    }
    try {
      let json: unknown;
      try {
        json = JSON.parse(await leerTexto(archivo));
      } catch {
        throw new ErrorRespaldo('El archivo no es un respaldo de llave válido');
      }
      const importado = await importarRespaldo(json, passwordImportar);
      await guardarPar(username, importado);
      await mostrar(importado);
      setPasswordImportar('');
      setAviso('Llave importada.');
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  return (
    <main>
      <h1>Mi llave</h1>
      <p>
        Tu llave de firma se genera y se guarda en este navegador. La llave privada nunca sale de
        aquí sin cifrar.
      </p>
      {cargando ? (
        <p>Cargando tu llave…</p>
      ) : par ? (
        <section aria-label="Llave actual">
          <p>Llave pública (SPKI, base64):</p>
          <code>{spki}</code>
          <p>Huella SHA-256: {huella}</p>
        </section>
      ) : (
        <section aria-label="Sin llave">
          <p>Este navegador no tiene una llave para {username}.</p>
          <button onClick={() => void generar()}>Generar llave</button>
        </section>
      )}

      {par && (
        <section aria-label="Respaldo">
          <h2>Respaldo cifrado</h2>
          <label>
            Contraseña para el respaldo{' '}
            <input
              type="password"
              value={passwordRespaldo}
              onChange={(e) => setPasswordRespaldo(e.target.value)}
            />
          </label>
          <button onClick={() => void descargar()}>Descargar respaldo</button>
        </section>
      )}

      <section aria-label="Importar">
        <h2>Importar un respaldo</h2>
        <label>
          Archivo de respaldo{' '}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Contraseña del respaldo importado{' '}
          <input
            type="password"
            value={passwordImportar}
            onChange={(e) => setPasswordImportar(e.target.value)}
          />
        </label>
        <button onClick={() => void importar()}>Importar respaldo</button>
      </section>

      {error && <p role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}
    </main>
  );
}
