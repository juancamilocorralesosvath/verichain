import { describe, expect, it } from 'vitest';
import { validarPersona } from '../src/validacion';

const validos = {
  cedula: '1234567',
  nombre: 'Ana Pérez',
  direccion: 'Calle 1 # 2-3',
  telefono: '+573001234567',
};

describe('validarPersona (replica el DTO del servidor)', () => {
  it('acepta valores válidos', () => {
    const r = validarPersona(validos);
    expect(r.valido).toBe(true);
    expect(r.errores).toEqual({});
  });

  it.each([
    ['cédula con letras', { cedula: '12ab56' }, 'cedula', /cédula/i],
    ['cédula corta', { cedula: '12345' }, 'cedula', /cédula/i],
    ['cédula larga', { cedula: '12345678901' }, 'cedula', /cédula/i],
    ['nombre con dígitos', { nombre: 'Ana 2' }, 'nombre', /nombre/i],
    ['nombre muy corto', { nombre: 'A' }, 'nombre', /nombre/i],
    ['nombre muy largo', { nombre: 'a'.repeat(101) }, 'nombre', /nombre/i],
    ['dirección corta', { direccion: 'abc' }, 'direccion', /dirección/i],
    ['dirección larga', { direccion: 'a'.repeat(151) }, 'direccion', /dirección/i],
    ['teléfono con letras', { telefono: '300abc4567' }, 'telefono', /teléfono/i],
    ['teléfono corto', { telefono: '123456' }, 'telefono', /teléfono/i],
  ])('rechaza %s', (_n, cambio, campo, mensaje) => {
    const r = validarPersona({ ...validos, ...cambio });
    expect(r.valido).toBe(false);
    expect(r.errores[campo as keyof typeof r.errores]).toMatch(mensaje);
  });

  it('acepta tildes, ñ, apóstrofo y guion en el nombre', () => {
    expect(validarPersona({ ...validos, nombre: "María-José Núñez D'Angelo" }).valido).toBe(true);
  });

  it('normaliza: trim y NFC', () => {
    const r = validarPersona({ ...validos, nombre: '  José Núñez  ', cedula: ' 1234567 ' });
    expect(r.valido).toBe(true);
    expect(r.normalizado.nombre).toBe('José Núñez');
    expect(r.normalizado.cedula).toBe('1234567');
  });
});
