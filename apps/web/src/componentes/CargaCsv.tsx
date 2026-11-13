import { useState } from 'react';
import { confirmarLote, prepararLote, type LoteApi } from '../api/bloques';
import { firmarHashDatos } from '../cripto/llaves';
import { Alerta, Boton, Tabla, Tarjeta } from '../ui';

const MAX_BYTES = 200 * 1024; // el servidor aplica el mismo límite
const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

/**
 * Carga masiva desde CSV (diseño §5.6): el servidor valida y prepara los borradores, el navegador firma
 * todos los `hash_datos` con la llave local y se confirman en orden. La validación real es la del servidor.
 */
export function CargaCsv({
  llaveId,
  privada,
  alAnexar,
}: {
  llaveId: number;
  privada: CryptoKey;
  alAnexar: () => void | Promise<void>;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lote, setLote] = useState<LoteApi | null>(null);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');
  const [ocupado, setOcupado] = useState<'validando' | 'anexando' | null>(null);

  async function validar() {
    setError('');
    setResultado('');
    setLote(null);
    if (!archivo) {
      setError('Elige un archivo CSV');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError('El archivo supera el máximo de 200 KB');
      return;
    }
    setOcupado('validando');
    try {
      setLote(await prepararLote(archivo));
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(null);
    }
  }

  async function anexar() {
    if (!lote) return;
    setError('');
    setOcupado('anexando');
    try {
      const items = [];
      for (const v of lote.validas) {
        items.push({
          borrador_id: v.borrador_id,
          llave_id: llaveId,
          firma_b64: await firmarHashDatos(privada, v.hash_datos),
        });
      }
      const res = await confirmarLote(items);
      const resumen = `Se anexaron ${res.anexadas.length} de ${items.length} bloques`;
      if (res.error) setError(`${resumen}. Se detuvo: ${res.error}`);
      else setResultado(`${resumen}.`);
      setLote(null);
      await alAnexar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(null);
    }
  }

  const plural = (n: number, uno: string, varios: string): string =>
    `${n} ${n === 1 ? uno : varios}`;

  return (
    <Tarjeta aria-label="Carga masiva">
      <h2>Carga masiva (CSV)</h2>
      <p>
        Columnas exactas: <code>cedula,nombre,direccion,telefono</code> (máximo 500 filas y 200 KB).
        Hay un ejemplo en <code>docs/ejemplos/personas.csv</code>.
      </p>
      <label>
        Archivo CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
      </label>
      <Boton onClick={() => void validar()} disabled={ocupado !== null}>
        Subir y validar
      </Boton>
      {ocupado === 'validando' && <p>Validando el archivo…</p>}
      {error && <Alerta>{error}</Alerta>}
      {resultado && <Alerta tipo="info">{resultado}</Alerta>}
      {lote && (
        <>
          <p>
            {`${plural(lote.validas.length, 'válida', 'válidas')} y ${plural(lote.invalidas.length, 'inválida', 'inválidas')}`}
            .
          </p>
          {lote.invalidas.length > 0 && (
            <Tabla etiqueta="Filas inválidas">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Errores</th>
                </tr>
              </thead>
              <tbody>
                {lote.invalidas.map((i) => (
                  <tr key={i.fila}>
                    <td>{i.fila}</td>
                    <td>{i.errores.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {lote.validas.length > 0 && (
            <Boton onClick={() => void anexar()} disabled={ocupado !== null}>
              {`Firmar y anexar ${lote.validas.length}`}
            </Boton>
          )}
          {ocupado === 'anexando' && <Alerta tipo="info">Firmando y minando los bloques…</Alerta>}
        </>
      )}
    </Tarjeta>
  );
}
