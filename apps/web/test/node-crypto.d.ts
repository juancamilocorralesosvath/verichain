// Declaración mínima para las pruebas: el tsconfig web no carga @types/node a propósito
// (src/ es código de navegador). Solo se declara lo que usan las pruebas de compatibilidad.
declare module 'node:crypto' {
  export function verify(
    algorithm: string,
    data: Uint8Array,
    key: {
      key: Uint8Array;
      format: 'der';
      type: 'spki';
      dsaEncoding: 'ieee-p1363' | 'der';
    },
    signature: Uint8Array,
  ): boolean;
  export const webcrypto: Crypto;
}

declare module 'node:fs' {
  export function readFileSync(ruta: string, codificacion: 'utf8'): string;
}
