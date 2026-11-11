import { describe, expect, it } from 'vitest';
import { CifradoService, ErrorDatoCorrupto } from '../src/cripto/cifrado.service.js';

describe('AES-256-GCM', () => {
  const servicio = new CifradoService(Buffer.alloc(32, 1).toString('base64'));
  it('recupera texto Unicode y usa IV aleatorio', () => {
    const texto = 'Calle Piñón, número 23';
    const primero = servicio.cifrar(texto);
    const segundo = servicio.cifrar(texto);
    expect(primero).not.toBe(segundo);
    expect(servicio.descifrar(primero)).toBe(texto);
  });
  it.each([12, 28])('rechaza manipulación en byte %i', (indice) => {
    const datos = Buffer.from(servicio.cifrar('texto de prueba'), 'base64');
    datos[indice] = (datos[indice] ?? 0) ^ 1;
    expect(() => servicio.descifrar(datos.toString('base64'))).toThrow(ErrorDatoCorrupto);
  });
  it('rechaza llaves ausentes o de longitud incorrecta', () => {
    expect(() => new CifradoService('')).toThrow();
    expect(() => new CifradoService(Buffer.alloc(31).toString('base64'))).toThrow();
  });
});
