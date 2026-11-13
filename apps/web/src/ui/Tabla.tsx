import type { ReactNode } from 'react';

/** Tabla con desplazamiento horizontal accesible por teclado (útil a 375 px). */
export function Tabla({
  etiqueta = 'Tabla',
  children,
}: {
  etiqueta?: string;
  children: ReactNode;
}) {
  return (
    <div className="tabla-scroll" role="region" aria-label={etiqueta} tabIndex={0}>
      <table className="tabla">{children}</table>
    </div>
  );
}
