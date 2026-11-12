/** El módulo de ataques solo existe con DEMO_MODE=true (nunca en producción). */
export const esModoDemo = (env: Record<string, string | undefined> = process.env): boolean =>
  env['DEMO_MODE'] === 'true';
