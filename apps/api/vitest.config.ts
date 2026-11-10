import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite los metadatos de decoradores que Nest necesita para la inyección por tipo.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
