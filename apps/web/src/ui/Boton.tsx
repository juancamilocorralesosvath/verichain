import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'peligro';

/** Botón del sistema visual. Sin `type` explícito se comporta como un `<button>` normal. */
export function Boton({
  variante = 'primario',
  className,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...resto}
      className={['boton', `boton-${variante}`, className].filter(Boolean).join(' ')}
    />
  );
}
