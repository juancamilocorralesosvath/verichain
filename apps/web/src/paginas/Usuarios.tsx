import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ROLES,
  actualizarUsuario,
  crearUsuario,
  listarUsuarios,
  type RolApi,
  type UsuarioApi,
} from '../api/admin';
import { useSesion } from '../sesion';
import { Alerta, Boton, Campo, Tabla, Tarjeta } from '../ui';

const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

export function Usuarios() {
  const { usuario: yo } = useSesion();
  const [usuarios, setUsuarios] = useState<UsuarioApi[] | null>(null);
  const [error, setError] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<RolApi>('registrador');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await listarUsuarios());
      setError('');
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    setErrorAccion('');
    setOcupado(true);
    try {
      await crearUsuario({ username, password, rol });
      setUsername('');
      setPassword('');
      await cargar();
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  }

  async function cambiar(id: number, cambios: { activo?: boolean; rol?: RolApi }) {
    setErrorAccion('');
    try {
      await actualizarUsuario(id, cambios);
      await cargar();
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    }
  }

  return (
    <main>
      <h1>Usuarios</h1>
      <Tarjeta aria-label="Nuevo usuario">
        <h2>Nuevo usuario</h2>
        <form onSubmit={(e) => void crear(e)}>
          <Campo
            etiqueta="Usuario"
            required
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Campo
            etiqueta="Contraseña"
            required
            type="password"
            autoComplete="new-password"
            ayuda="Mínimo 12 caracteres."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="campo">
            <label>
              <span className="campo-etiqueta">Rol</span>
              <select value={rol} onChange={(e) => setRol(e.target.value as RolApi)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Boton disabled={ocupado}>Crear usuario</Boton>
        </form>
      </Tarjeta>
      {errorAccion && <Alerta>{errorAccion}</Alerta>}
      {error ? (
        <Alerta>{error}</Alerta>
      ) : usuarios === null ? (
        <p>Cargando usuarios…</p>
      ) : usuarios.length === 0 ? (
        <p>No hay usuarios.</p>
      ) : (
        <Tabla etiqueta="Usuarios">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <select
                    aria-label={`Rol de ${u.username}`}
                    value={u.rol}
                    onChange={(e) => void cambiar(u.id, { rol: e.target.value as RolApi })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td>{u.creado_en}</td>
                <td>
                  <Boton
                    variante="secundario"
                    // el servidor también lo impide: un admin no se desactiva a sí mismo
                    disabled={u.activo && u.username === yo?.username}
                    aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.username}`}
                    onClick={() => void cambiar(u.id, { activo: !u.activo })}
                  >
                    {u.activo ? 'Desactivar' : 'Activar'}
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
