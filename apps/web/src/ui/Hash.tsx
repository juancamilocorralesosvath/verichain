import { useState } from 'react';

/** Primeros 8 y últimos 4 caracteres; el hash completo va en el tooltip. */
export const abreviarHash = (hash: string): string =>
  hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;

/** Hash abreviado (monoespaciado), con el valor completo en el tooltip y botón para copiarlo. */
export function Hash({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false); // sin permiso de portapapeles: el valor completo sigue en el tooltip
    }
  }
  return (
    <span className="hash">
      <span className="hash-valor" title={valor}>
        {abreviarHash(valor)}
      </span>
      <button
        type="button"
        className="hash-copiar"
        aria-label={copiado ? 'Hash copiado' : 'Copiar hash completo'}
        onClick={() => void copiar()}
      >
        <span aria-hidden="true">{copiado ? '✓' : '⧉'}</span>
      </button>
    </span>
  );
}
