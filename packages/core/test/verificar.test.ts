import { beforeAll, describe, expect, it } from 'vitest';
import { verificarCadena, type BloqueCadena, type EstadoChequeo } from '../src/index.js';
import { clonar, crearEntorno, reencadenar, type Entorno } from './ayudantes.js';

let env: Entorno;
beforeAll(async () => {
  env = await crearEntorno(5);
});

const fallas = (r: Awaited<ReturnType<typeof verificarCadena>>, i: number): string[] =>
  Object.entries(r.bloques[i]?.chequeos ?? {})
    .filter(([, v]) => v === 'falla')
    .map(([k]) => k);

describe('verificarCadena', () => {
  it('cadena íntegra: válida y con todo en ok', async () => {
    const r = await verificarCadena(env.bloques, env.opciones);
    expect(r.valida).toBe(true);
    expect(r.primerBloqueRoto).toBeNull();
    expect(r.totalBloques).toBe(5);
    expect(r.sello.estado).toBe('ok');
    for (const b of r.bloques) {
      const esperado: EstadoChequeo = b.indice === 0 ? 'no-aplica' : 'ok';
      expect(b.chequeos).toEqual({
        hashDatos: 'ok',
        enlace: 'ok',
        hashCadena: 'ok',
        pow: 'ok',
        firmaUsuario: esperado,
      });
      expect(b.motivos).toEqual([]);
    }
  });

  it('ataque 1: cambiar persona.nombre del bloque 2', async () => {
    const bloques = clonar(env.bloques);
    (bloques[2]?.persona as NonNullable<BloqueCadena['persona']>).nombre = 'Intruso';
    const r = await verificarCadena(bloques, env.opciones);
    expect(r.valida).toBe(false);
    expect(r.primerBloqueRoto).toBe(2);
    expect(fallas(r, 2)).toEqual(['hashDatos', 'hashCadena']);
    expect(r.bloques[2]?.motivos.join(' ')).toMatch(/hash_datos/);
  });

  it('ataque 2: cambiar un carácter de telefono_cifrado', async () => {
    const bloques = clonar(env.bloques);
    const p = bloques[3]?.persona as NonNullable<BloqueCadena['persona']>;
    p.telefono_cifrado = 'X' + p.telefono_cifrado.slice(1);
    const r = await verificarCadena(bloques, env.opciones);
    expect(fallas(r, 3)).toContain('hashDatos');
    expect(r.primerBloqueRoto).toBe(3);
  });

  it('ataque 3: cambiar dato y recalcular hashes y PoW → falla firma de usuario y sello', async () => {
    const bloques = clonar(env.bloques);
    (bloques[2]?.persona as NonNullable<BloqueCadena['persona']>).nombre = 'Intruso';
    reencadenar(bloques, 2);
    const r = await verificarCadena(bloques, env.opciones);
    for (const b of r.bloques) {
      expect(b.chequeos.hashDatos).toBe('ok');
      expect(b.chequeos.enlace).toBe('ok');
      expect(b.chequeos.hashCadena).toBe('ok');
      expect(b.chequeos.pow).toBe('ok');
    }
    expect(fallas(r, 2)).toEqual(['firmaUsuario']);
    expect(r.primerBloqueRoto).toBe(2);
    expect(r.sello.estado).toBe('falla');
    expect(r.valida).toBe(false);
  });

  it('ataque 4: borrar el último bloque → bloques ok pero el sello falla (truncamiento)', async () => {
    const r = await verificarCadena(env.bloques.slice(0, 4), env.opciones);
    expect(r.primerBloqueRoto).toBeNull();
    expect(r.bloques.every((b) => !Object.values(b.chequeos).includes('falla'))).toBe(true);
    expect(r.sello.estado).toBe('falla');
    expect(r.sello.motivos.join(' ')).toMatch(/Truncamiento/);
    expect(r.valida).toBe(false);
  });

  it('ataque 5: intercambiar los bloques 2 y 3 → falla el enlace', async () => {
    const bloques = clonar(env.bloques);
    [bloques[2], bloques[3]] = [bloques[3] as BloqueCadena, bloques[2] as BloqueCadena];
    bloques.forEach((b, i) => (b.indice = i));
    const r = await verificarCadena(bloques, env.opciones);
    expect(fallas(r, 2)).toContain('enlace');
    expect(r.primerBloqueRoto).toBe(2);
  });

  it('un hueco en los índices falla en enlace', async () => {
    const bloques = clonar(env.bloques);
    (bloques[3] as BloqueCadena).indice = 7;
    const r = await verificarCadena(bloques, env.opciones);
    expect(fallas(r, 3)).toContain('enlace');
    expect(r.bloques[3]?.motivos.join(' ')).toMatch(/índice/);
  });

  it('persona null fuera del génesis falla en hashDatos', async () => {
    const bloques = clonar(env.bloques);
    (bloques[1] as BloqueCadena).persona = null;
    const r = await verificarCadena(bloques, env.opciones);
    expect(fallas(r, 1)).toContain('hashDatos');
  });

  it('firma faltante o llave inexistente falla en firmaUsuario', async () => {
    const sinFirma = clonar(env.bloques);
    (sinFirma[1] as BloqueCadena).firma_usuario = null;
    expect(fallas(await verificarCadena(sinFirma, env.opciones), 1)).toEqual(['firmaUsuario']);

    const sinLlave = clonar(env.bloques);
    (sinLlave[1] as BloqueCadena).llave_id = 99;
    expect(fallas(await verificarCadena(sinLlave, env.opciones), 1)).toEqual(['firmaUsuario']);
  });

  it('un PoW insuficiente falla en pow', async () => {
    const r = await verificarCadena(env.bloques, { ...env.opciones, dificultad: 8 });
    expect(fallas(r, 1)).toContain('pow');
  });

  it('sin verificarFirma, firmas y sello son no-aplica y la cadena íntegra es válida', async () => {
    const r = await verificarCadena(env.bloques, { dificultad: 2, llavesUsuarios: {} });
    expect(r.valida).toBe(true);
    expect(r.sello.estado).toBe('no-aplica');
    for (const b of r.bloques) expect(b.chequeos.firmaUsuario).toBe('no-aplica');
  });

  it('los motivos están en español y nombran el chequeo', async () => {
    const bloques = clonar(env.bloques);
    (bloques[4]?.persona as NonNullable<BloqueCadena['persona']>).cedula = '999999';
    const r = await verificarCadena(bloques, env.opciones);
    const motivos = r.bloques[4]?.motivos.join(' | ') ?? '';
    expect(motivos).toMatch(/datos de la persona/);
    expect(motivos).toMatch(/hash de cadena/);
  });
});
