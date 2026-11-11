import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { ParLlaves } from './llaves';

let tienda: UseStore | undefined;
// se crea al primer uso (no al importar el módulo)
const almacen = (): UseStore => (tienda ??= createStore('verichain', 'llaves'));

/** Guarda el par de CryptoKey de un usuario en IndexedDB (las llaves se guardan como objetos, no como bytes). */
export const guardarPar = (username: string, par: ParLlaves): Promise<void> =>
  set(username, par, almacen());

export async function leerPar(username: string): Promise<ParLlaves | null> {
  return (await get<ParLlaves>(username, almacen())) ?? null;
}

export const borrarPar = (username: string): Promise<void> => del(username, almacen());
