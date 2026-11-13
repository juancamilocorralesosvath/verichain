import type { ReactNode } from 'react';

/** `error` y `aviso` se anuncian de inmediato (`role="alert"`); `info` es un estado pasivo. */
export function Alerta({
  tipo = 'error',
  children,
}: {
  tipo?: 'error' | 'aviso' | 'info';
  children: ReactNode;
}) {
  return (
    <p role={tipo === 'info' ? 'status' : 'alert'} className="alerta" data-tipo={tipo}>
      {children}
    </p>
  );
}
