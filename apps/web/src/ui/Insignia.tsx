import type { EstadoChequeo } from '@bc/core';

const TEXTO: Record<EstadoChequeo, { icono: string; texto: string }> = {
  ok: { icono: '✓', texto: 'ok' },
  falla: { icono: '✕', texto: 'falla' },
  'no-aplica': { icono: '–', texto: 'no aplica' },
};

/** Estado de un chequeo: nunca solo color (icono + texto) para que se entienda sin verlo. */
export function Insignia({ estado }: { estado: EstadoChequeo }) {
  const { icono, texto } = TEXTO[estado];
  return (
    <span className="insignia" data-estado={estado}>
      <span aria-hidden="true">{icono}</span> {texto}
    </span>
  );
}
