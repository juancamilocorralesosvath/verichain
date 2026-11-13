import type { ReporteCadena } from '@bc/core';
import { solicitar, solicitarArchivo } from './cliente';

export type RolApi = 'admin' | 'registrador' | 'auditor';
export const ROLES: RolApi[] = ['admin', 'registrador', 'auditor'];

export interface UsuarioApi {
  id: number;
  username: string;
  rol: RolApi;
  activo: boolean;
  creado_en: string;
}
export const listarUsuarios = (): Promise<UsuarioApi[]> => solicitar<UsuarioApi[]>('/usuarios');
export const crearUsuario = (datos: {
  username: string;
  password: string;
  rol: RolApi;
}): Promise<UsuarioApi> =>
  solicitar<UsuarioApi>('/usuarios', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarUsuario = (
  id: number,
  cambios: { activo?: boolean; rol?: RolApi },
): Promise<UsuarioApi> =>
  solicitar<UsuarioApi>(`/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });

export interface LlavePendienteApi {
  id: number;
  version: number;
  estado: string;
  spki_b64: string;
  creado_en: string;
  username: string;
}
export const llavesPendientes = (): Promise<LlavePendienteApi[]> =>
  solicitar<LlavePendienteApi[]>('/llaves/pendientes');
export const aprobarLlave = (id: number): Promise<unknown> =>
  solicitar(`/llaves/${id}/aprobar`, { method: 'POST' });
export const rechazarLlave = (id: number): Promise<unknown> =>
  solicitar(`/llaves/${id}/rechazar`, { method: 'POST' });

export interface AtaqueApi {
  id: string;
  nombre: string;
  descripcion: string;
  deteccionEsperada: string;
}
export const catalogoAtaques = (): Promise<AtaqueApi[]> => solicitar<AtaqueApi[]>('/ataques');
export const ejecutarAtaque = (
  id: string,
  indice: number,
): Promise<{ ejecutado: boolean; detalle: string }> =>
  solicitar(`/ataques/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ indice }),
  });
export const tomarSnapshot = (): Promise<{ guardado: boolean; bloques: number }> =>
  solicitar('/demo/snapshot', { method: 'POST' });
export const restaurarDemo = (): Promise<{ restaurado: boolean; verificacion: ReporteCadena }> =>
  solicitar('/demo/restaurar', { method: 'POST' });

export interface EntradaBitacoraApi {
  id: number;
  fecha: string;
  usuario: string;
  accion: string;
  resultado: string;
  ip: string;
  detalle: string;
  hash: string;
}
export interface PaginaBitacoraApi {
  entradas: EntradaBitacoraApi[];
  pagina: number;
  totalPaginas: number;
  total: number;
  verificacion: { valida: boolean; primeraRota: number | null };
}
export const leerBitacora = (pagina: number): Promise<PaginaBitacoraApi> =>
  solicitar<PaginaBitacoraApi>(`/bitacora?pagina=${pagina}`);

export interface LlaveServidorApi {
  pem: string;
  huella_sha256: string;
}
export const llaveServidor = (): Promise<LlaveServidorApi> =>
  solicitar<LlaveServidorApi>('/cadena/llave-servidor');
export const descargarExportacion = (): Promise<{ nombre: string; contenido: string }> =>
  solicitarArchivo('/cadena/exportar', 'cadena.json');
