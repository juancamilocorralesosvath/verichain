/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { CAMPOS_PERSONA, serializarPersona, type FilaPersona } from '../src/index.js';

const base: FilaPersona = {
  cedula: '1234567890',
  nombre: 'Ana Pérez',
  direccion_cifrada: 'ZGlyZWNjaW9u',
  telefono_cifrado: 'dGVsZWZvbm8=',
  creado_en: '2026-11-09T12:30:45.123Z',
  creado_por: 'usuario-1',
};

describe('serializarPersona', () => {
  it('produce JSON sin espacios en el orden de CAMPOS_PERSONA', () => {
    expect(serializarPersona(base)).toBe(
      '{"cedula":"1234567890","nombre":"Ana Pérez","direccion_cifrada":"ZGlyZWNjaW9u",' +
        '"telefono_cifrado":"dGVsZWZvbm8=","creado_en":"2026-11-09T12:30:45.123Z","creado_por":"usuario-1"}',
    );
    expect(CAMPOS_PERSONA).toHaveLength(6);
  });

  it('el orden de inserción de las llaves no cambia el resultado', () => {
    const barajado = Object.fromEntries(Object.entries(base).reverse()) as FilaPersona;
    expect(Object.keys(barajado)[0]).toBe('creado_por');
    expect(serializarPersona(barajado)).toBe(serializarPersona(base));
  });

  it('lanza error si falta un campo', () => {
    const sinNombre: Partial<FilaPersona> = { ...base };
    delete sinNombre.nombre;
    expect(() => serializarPersona(sinNombre as unknown as FilaPersona)).toThrow(Error);
  });

  it('lanza error si sobra un campo', () => {
    expect(() => serializarPersona({ ...base, extra: 'x' } as unknown as FilaPersona)).toThrow(
      Error,
    );
  });

  it('lanza error si un valor no es string', () => {
    expect(() => serializarPersona({ ...base, cedula: 123 } as unknown as FilaPersona)).toThrow(
      Error,
    );
  });

  it.each([
    '2026-11-09',
    '2026-11-09T12:30:45Z',
    '2026-11-09T12:30:45.123+00:00',
    '2026-11-09 12:30:45.123Z',
    '2026-11-09T12:30:45.123Z ',
    '',
  ])('lanza error con creado_en mal formado: %j', (creado_en) => {
    expect(() => serializarPersona({ ...base, creado_en })).toThrow(Error);
  });

  it('conserva tildes y ñ sin escapes \\u', () => {
    const salida = serializarPersona({ ...base, nombre: 'Peña Núñez' });
    expect(salida).toContain('"nombre":"Peña Núñez"');
    expect(salida).not.toContain('\\u');
  });

  it('no recorta espacios ni normaliza Unicode', () => {
    const nfd = 'Núñez ';
    expect(serializarPersona({ ...base, nombre: nfd })).toContain(
      `"nombre":${JSON.stringify(nfd)}`,
    );
  });
});

describe('isomorfismo', () => {
  it('src/ no importa módulos node:*', () => {
    const fuentes = import.meta.glob('../src/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(fuentes).length).toBeGreaterThan(0);
    for (const [archivo, codigo] of Object.entries(fuentes)) {
      expect(codigo, archivo).not.toMatch(/['"]node:/);
    }
  });
});
