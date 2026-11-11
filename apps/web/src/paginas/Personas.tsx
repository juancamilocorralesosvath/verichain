import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listarPersonas, crearPersona, type PersonaApi } from '../api/personas';
import { useSesion } from '../sesion';
import { validarPersona, type Campo, type ValoresPersona } from '../validacion';

const vacio: ValoresPersona = { cedula: '', nombre: '', direccion: '', telefono: '' };
const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

export function Personas() {
  const { usuario } = useSesion();
  const esRegistrador = usuario?.rol === 'registrador';
  const [personas, setPersonas] = useState<PersonaApi[] | null>(null);
  const [error, setError] = useState('');
  const [valores, setValores] = useState<ValoresPersona>(vacio);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPersonas(await listarPersonas());
      setError('');
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorServidor('');
    const resultado = validarPersona(valores);
    setErrores(resultado.errores);
    if (!resultado.valido) return; // la validación real es la del servidor; aquí solo se evita el viaje
    setEnviando(true);
    try {
      await crearPersona(resultado.normalizado);
      setValores(vacio);
      await cargar();
    } catch (e) {
      setErrorServidor(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  }

  // Solo el registrador ve datos personales; para cualquier otro rol siempre ***.
  const dato = (valor: string | null | undefined): string =>
    !esRegistrador || valor === undefined ? '***' : (valor ?? '—');
  const campo = (nombre: Campo, etiqueta: string) => (
    <div>
      <label>
        {etiqueta}{' '}
        <input
          value={valores[nombre]}
          onChange={(e) => setValores({ ...valores, [nombre]: e.target.value })}
        />
      </label>
      {errores[nombre] && <span role="alert">{errores[nombre]}</span>}
    </div>
  );

  return (
    <main>
      <h1>Personas</h1>
      {esRegistrador && (
        <form onSubmit={(e) => void enviar(e)} noValidate aria-label="Crear persona">
          {campo('cedula', 'Cédula')}
          {campo('nombre', 'Nombre')}
          {campo('direccion', 'Dirección')}
          {campo('telefono', 'Teléfono')}
          <button disabled={enviando}>Crear persona</button>
          {errorServidor && <p role="alert">{errorServidor}</p>}
        </form>
      )}
      {error ? (
        <p role="alert">{error}</p>
      ) : personas === null ? (
        <p>Cargando personas…</p>
      ) : personas.length === 0 ? (
        <p>No hay personas registradas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cédula</th>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Creado en</th>
              <th>Creado por</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id} data-integra={String(p.integra !== false)}>
                <td>{p.cedula}</td>
                <td>{p.nombre}</td>
                <td>{dato(p.direccion)}</td>
                <td>{dato(p.telefono)}</td>
                <td>{p.creado_en}</td>
                <td>{p.creado_por}</td>
                <td>{p.integra === false ? 'Dato corrupto' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
