export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
export async function solicitar<T>(
  ruta: string,
  opciones: RequestInit = {},
  redirigir401 = true,
): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    ...opciones,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
  });
  if (!respuesta.ok) {
    if (respuesta.status === 401 && redirigir401)
      window.dispatchEvent(new Event('sesion-expirada'));
    const datos: unknown = await respuesta.json().catch(() => null);
    const mensaje =
      typeof datos === 'object' &&
      datos !== null &&
      'mensaje' in datos &&
      typeof datos.mensaje === 'string'
        ? datos.mensaje
        : 'No fue posible completar la solicitud';
    throw new ErrorApi(respuesta.status, mensaje);
  }
  if (respuesta.status === 204) return undefined as T;
  const texto = await respuesta.text();
  return texto ? (JSON.parse(texto) as T) : (undefined as T);
}
