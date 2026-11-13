import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { confirmarBloque, prepararBloque, type ResultadoConfirmar } from '../api/bloques';
import { misLlaves } from '../api/llaves';
import { listarPersonas, type PersonaApi } from '../api/personas';
import { leerPar } from '../cripto/almacen';
import { exportarPublicaSpkiB64, firmarHashDatos, type ParLlaves } from '../cripto/llaves';
import { useSesion } from '../sesion';
import { Alerta, Boton, Campo as CampoUi, Tabla, Tarjeta } from '../ui';
import { validarPersona, type Campo, type ValoresPersona } from '../validacion';

const vacio: ValoresPersona = { cedula: '', nombre: '', direccion: '', telefono: '' };
const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

/** Qué falta para poder firmar: la llave local debe estar registrada y aprobada en el servidor. */
type EstadoLlave =
  | { tipo: 'cargando' }
  | { tipo: 'sin-llave-local' }
  | { tipo: 'no-registrada' }
  | { tipo: 'no-aprobada'; estado: string }
  | { tipo: 'aprobada'; llaveId: number; par: ParLlaves }
  | { tipo: 'error'; mensaje: string };

async function comprobarLlave(username: string): Promise<EstadoLlave> {
  const par = await leerPar(username);
  if (!par) return { tipo: 'sin-llave-local' };
  const spki = await exportarPublicaSpkiB64(par.publica);
  const registrada = (await misLlaves()).find((l) => l.spki_b64 === spki);
  if (!registrada) return { tipo: 'no-registrada' };
  if (registrada.estado !== 'aprobada') return { tipo: 'no-aprobada', estado: registrada.estado };
  return { tipo: 'aprobada', llaveId: registrada.id, par };
}

function MensajeLlave({ llave }: { llave: EstadoLlave }) {
  const texto =
    llave.tipo === 'sin-llave-local'
      ? 'No tienes una llave en este navegador. Genérala para poder crear registros firmados.'
      : llave.tipo === 'no-registrada'
        ? 'Tu llave no está registrada en el servidor. Regístrala para poder crear registros.'
        : llave.tipo === 'no-aprobada' && llave.estado === 'pendiente'
          ? 'Tu llave está pendiente de aprobación por un administrador.'
          : `Tu llave no puede firmar (estado: ${llave.tipo === 'no-aprobada' ? llave.estado : ''}).`;
  return (
    <Tarjeta aria-label="Llave requerida">
      <p>{texto}</p>
      <Link to="/mi-llave">Ir a Mi llave</Link>
    </Tarjeta>
  );
}

export function Personas() {
  const { usuario } = useSesion();
  const esRegistrador = usuario?.rol === 'registrador';
  const [personas, setPersonas] = useState<PersonaApi[] | null>(null);
  const [error, setError] = useState('');
  const [valores, setValores] = useState<ValoresPersona>(vacio);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [minando, setMinando] = useState(false);
  const [anexado, setAnexado] = useState<ResultadoConfirmar | null>(null);
  const [llave, setLlave] = useState<EstadoLlave>({ tipo: 'cargando' });

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

  useEffect(() => {
    if (!esRegistrador || !usuario) return;
    let activo = true;
    comprobarLlave(usuario.username)
      .then((estado) => activo && setLlave(estado))
      .catch((e: unknown) => activo && setLlave({ tipo: 'error', mensaje: mensajeDe(e) }));
    return () => {
      activo = false;
    };
  }, [esRegistrador, usuario]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorServidor('');
    setAnexado(null);
    const resultado = validarPersona(valores);
    setErrores(resultado.errores);
    if (!resultado.valido || llave.tipo !== 'aprobada') return; // la validación real es la del servidor
    setEnviando(true);
    try {
      // preparar → firmar (con la llave de este navegador) → confirmar
      const { borrador_id, hash_datos } = await prepararBloque(resultado.normalizado);
      const firma_b64 = await firmarHashDatos(llave.par.privada, hash_datos);
      setMinando(true);
      setAnexado(await confirmarBloque({ borrador_id, llave_id: llave.llaveId, firma_b64 }));
      setValores(vacio);
      await cargar();
    } catch (e) {
      setErrorServidor(mensajeDe(e));
    } finally {
      setMinando(false);
      setEnviando(false);
    }
  }

  // Solo el registrador ve datos personales; para cualquier otro rol siempre ***.
  const dato = (valor: string | null | undefined): string =>
    !esRegistrador || valor === undefined ? '***' : (valor ?? '—');
  const campo = (nombre: Campo, etiqueta: string) => (
    <CampoUi
      etiqueta={etiqueta}
      error={errores[nombre]}
      value={valores[nombre]}
      onChange={(e) => setValores({ ...valores, [nombre]: e.target.value })}
    />
  );

  return (
    <main>
      <h1>Personas</h1>
      {esRegistrador && llave.tipo === 'cargando' && <p>Comprobando tu llave…</p>}
      {esRegistrador && llave.tipo === 'error' && (
        <Alerta>No fue posible comprobar tu llave: {llave.mensaje}</Alerta>
      )}
      {esRegistrador &&
        (llave.tipo === 'sin-llave-local' ||
          llave.tipo === 'no-registrada' ||
          llave.tipo === 'no-aprobada') && <MensajeLlave llave={llave} />}
      {esRegistrador && llave.tipo === 'aprobada' && (
        <Tarjeta aria-label="Nueva persona">
          <form onSubmit={(e) => void enviar(e)} noValidate aria-label="Crear persona">
            {campo('cedula', 'Cédula')}
            {campo('nombre', 'Nombre')}
            {campo('direccion', 'Dirección')}
            {campo('telefono', 'Teléfono')}
            <Boton disabled={enviando}>Crear persona</Boton>
            {errorServidor && <Alerta>{errorServidor}</Alerta>}
            {minando && <Alerta tipo="info">Minando el bloque… (buscando el nonce)</Alerta>}
            {anexado && (
              <Alerta tipo="info">
                {`Bloque ${anexado.indice ?? ''} anexado`.replace('  ', ' ')}
                {anexado.nonce !== undefined &&
                  `: nonce ${anexado.nonce}, ${anexado.intentos ?? '?'} intentos, ${anexado.ms ?? '?'} ms`}
                .
              </Alerta>
            )}
          </form>
        </Tarjeta>
      )}
      {error ? (
        <Alerta>{error}</Alerta>
      ) : personas === null ? (
        <p>Cargando personas…</p>
      ) : personas.length === 0 ? (
        <p>No hay personas registradas.</p>
      ) : (
        <Tabla etiqueta="Personas registradas">
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
        </Tabla>
      )}
    </main>
  );
}
