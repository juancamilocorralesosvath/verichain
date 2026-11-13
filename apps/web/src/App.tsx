import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Cadena } from './paginas/Cadena';
import { MiLlave } from './paginas/MiLlave';
import { Personas } from './paginas/Personas';
import { Verificar } from './paginas/Verificar';
import { VerificadorLocal } from './paginas/VerificadorLocal';
import { SesionProvider, useSesion, type Rol } from './sesion';

const paginas: Record<string, ReactNode> = {
  '/personas': <Personas />,
  '/cadena': <Cadena />,
  '/mi-llave': <MiLlave />,
  '/verificar': <Verificar />,
};

const enlaces: { titulo: string; ruta: string; roles: Rol[] }[] = [
  { titulo: 'Personas', ruta: '/personas', roles: ['registrador', 'auditor'] },
  { titulo: 'Cadena', ruta: '/cadena', roles: ['registrador', 'auditor', 'admin'] },
  { titulo: 'Mi llave', ruta: '/mi-llave', roles: ['registrador'] },
  { titulo: 'Verificar', ruta: '/verificar', roles: ['auditor', 'admin'] },
  { titulo: 'Bitácora', ruta: '/bitacora', roles: ['auditor', 'admin'] },
  { titulo: 'Exportar', ruta: '/exportar', roles: ['auditor'] },
  { titulo: 'Usuarios', ruta: '/usuarios', roles: ['admin'] },
  { titulo: 'Llaves', ruta: '/llaves', roles: ['admin'] },
  { titulo: 'Ataques', ruta: '/ataques', roles: ['admin'] },
];
function Login() {
  const { entrar, usuario } = useSesion();
  const navegar = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  if (usuario) return <Navigate to="/cadena" replace />;
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    try {
      await entrar(username, password);
      navegar('/cadena');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible iniciar sesión');
    }
  }
  return (
    <main>
      <h1>Iniciar sesión</h1>
      <form onSubmit={enviar}>
        <label>
          Usuario <input required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Contraseña{' '}
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button>Entrar</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
function Protegida({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario } = useSesion();
  if (!usuario) return <Navigate to="/login" replace />;
  if (!roles.includes(usuario.rol))
    return (
      <main>
        <h1>Sin permiso</h1>
      </main>
    );
  return children;
}
function Contenido() {
  const { usuario, cargando, salir } = useSesion();
  if (cargando) return <p>Cargando sesión…</p>;
  return (
    <>
      <header>
        <h1>Verichain</h1>
        <nav aria-label="Navegación principal">
          {usuario &&
            enlaces
              .filter((e) => e.roles.includes(usuario.rol))
              .map((e) => (
                <Link key={e.ruta} to={e.ruta}>
                  {e.titulo}
                </Link>
              ))}
          <Link to="/verificador">Verificador independiente</Link>
        </nav>
        {usuario && (
          <>
            <span>
              {usuario.username} ({usuario.rol})
            </span>
            <button onClick={() => void salir()}>Cerrar sesión</button>
          </>
        )}
      </header>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verificador" element={<VerificadorLocal />} />
        {enlaces.map((e) => (
          <Route
            key={e.ruta}
            path={e.ruta}
            element={
              <Protegida roles={e.roles}>
                {paginas[e.ruta] ?? (
                  <main>
                    <h1>{e.titulo}</h1>
                    <p>Disponible próximamente.</p>
                  </main>
                )}
              </Protegida>
            }
          />
        ))}
        <Route path="*" element={<Navigate to={usuario ? '/cadena' : '/login'} replace />} />
      </Routes>
    </>
  );
}
export function App() {
  return (
    <SesionProvider>
      <Contenido />
    </SesionProvider>
  );
}
