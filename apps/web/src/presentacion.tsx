import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const CLAVE = 'verichain:presentacion';

/** El almacenamiento puede estar bloqueado (modo privado, política del equipo): nunca debe romper la app. */
const leer = (): boolean => {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
};
const guardar = (activo: boolean): void => {
  try {
    localStorage.setItem(CLAVE, activo ? '1' : '0');
  } catch {
    // solo no se recuerda
  }
};

const Contexto = createContext<{ activo: boolean; alternar: () => void }>({
  activo: false,
  alternar: () => undefined,
});

export const usePresentacion = () => useContext(Contexto);

/** Modo presentación (proyector): marca `<html data-presentacion="true">` y los estilos agrandan todo. */
export function PresentacionProvider({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState(leer);

  useEffect(() => {
    const raiz = document.documentElement;
    if (activo) raiz.setAttribute('data-presentacion', 'true');
    else raiz.removeAttribute('data-presentacion');
  }, [activo]);

  const alternar = useCallback(() => {
    setActivo((anterior) => {
      guardar(!anterior);
      return !anterior;
    });
  }, []);

  return <Contexto.Provider value={{ activo, alternar }}>{children}</Contexto.Provider>;
}

export function InterruptorPresentacion() {
  const { activo, alternar } = usePresentacion();
  return (
    <button
      type="button"
      className="boton boton-secundario"
      aria-pressed={activo}
      onClick={alternar}
    >
      Modo presentación
    </button>
  );
}
