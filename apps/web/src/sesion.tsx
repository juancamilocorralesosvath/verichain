import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { solicitar } from './api/cliente';
import { useNavigate } from 'react-router-dom';
export type Rol = 'admin' | 'registrador' | 'auditor';
export interface Usuario {
  username: string;
  rol: Rol;
}
interface Estado {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (username: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}
const Contexto = createContext<Estado | null>(null);
export function SesionProvider({ children }: { children: ReactNode }) {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let activo = true;
    solicitar<Usuario>('/auth/yo', {}, false)
      .then((u) => {
        if (activo) setUsuario(u);
      })
      .catch(() => {
        if (activo) setUsuario(null);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    const expirar = () => {
      setUsuario(null);
      navegar('/login', { replace: true });
    };
    window.addEventListener('sesion-expirada', expirar);
    return () => {
      activo = false;
      window.removeEventListener('sesion-expirada', expirar);
    };
  }, [navegar]);
  const entrar = useCallback(async (username: string, password: string) => {
    const u = await solicitar<Usuario>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUsuario(u);
  }, []);
  const salir = useCallback(async () => {
    try {
      await solicitar('/auth/logout', { method: 'POST' });
    } finally {
      setUsuario(null);
    }
  }, []);
  return (
    <Contexto.Provider value={{ usuario, cargando, entrar, salir }}>{children}</Contexto.Provider>
  );
}
export function useSesion(): Estado {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('Falta SesionProvider');
  return sesion;
}
