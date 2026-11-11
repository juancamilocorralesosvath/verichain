// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { borrarPar, guardarPar, leerPar } from '../src/cripto/almacen';
import {
  exportarPublicaSpkiB64,
  firmarHashDatos,
  generarPar,
  verificarFirma,
} from '../src/cripto/llaves';

const HASH = 'ab'.repeat(32);

describe('almacén IndexedDB', () => {
  it('sin llave guardada devuelve null', async () => {
    expect(await leerPar('nadie')).toBeNull();
  });

  it('guardar → leer devuelve un par que firma y verifica', async () => {
    const par = await generarPar();
    await guardarPar('ana', par);
    const leido = await leerPar('ana');
    expect(leido).not.toBeNull();
    const firma = await firmarHashDatos(leido!.privada, HASH);
    expect(await verificarFirma(par.publica, HASH, firma)).toBe(true);
    expect(await exportarPublicaSpkiB64(leido!.publica)).toBe(
      await exportarPublicaSpkiB64(par.publica),
    );
  });

  it('separa las llaves por usuario', async () => {
    const a = await generarPar();
    const b = await generarPar();
    await guardarPar('usuario-a', a);
    await guardarPar('usuario-b', b);
    expect(await exportarPublicaSpkiB64((await leerPar('usuario-a'))!.publica)).toBe(
      await exportarPublicaSpkiB64(a.publica),
    );
    expect(await exportarPublicaSpkiB64((await leerPar('usuario-b'))!.publica)).toBe(
      await exportarPublicaSpkiB64(b.publica),
    );
  });

  it('borrar elimina solo la llave de ese usuario', async () => {
    await guardarPar('x', await generarPar());
    await guardarPar('y', await generarPar());
    await borrarPar('x');
    expect(await leerPar('x')).toBeNull();
    expect(await leerPar('y')).not.toBeNull();
  });
});
