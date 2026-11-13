import type { HTMLAttributes } from 'react';

export function Tarjeta({ className, ...resto }: HTMLAttributes<HTMLElement>) {
  return <section {...resto} className={['tarjeta', className].filter(Boolean).join(' ')} />;
}
