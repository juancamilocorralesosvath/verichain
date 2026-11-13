import { useId, type InputHTMLAttributes } from 'react';

/** Etiqueta + control + mensaje de error asociado (`aria-describedby`). */
export function Campo({
  etiqueta,
  error,
  ayuda,
  ...entrada
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string; ayuda?: string }) {
  const id = useId();
  const descripcion = [error ? `${id}-error` : '', ayuda ? `${id}-ayuda` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="campo" data-invalido={error ? 'true' : undefined}>
      <label>
        <span className="campo-etiqueta">{etiqueta}</span>{' '}
        <input
          {...entrada}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion || undefined}
        />
      </label>
      {ayuda && (
        <span id={`${id}-ayuda`} className="campo-ayuda">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} role="alert" className="campo-error">
          {error}
        </span>
      )}
    </div>
  );
}
