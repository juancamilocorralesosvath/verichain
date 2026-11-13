export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
/** Convierte una respuesta no exitosa en un `ErrorApi` con el mensaje genérico de la API. */
async function fallar(respuesta: Response, redirigir401: boolean): Promise<never> {
  if (respuesta.status === 401 && redirigir401) window.dispatchEvent(new Event('sesion-expirada'));
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

export async function solicitar<T>(
  ruta: string,
  opciones: RequestInit = {},
  redirigir401 = true,
): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    ...opciones,
    credentials: 'include',
    // con FormData el navegador pone el Content-Type (multipart con su boundary)
    headers: {
      ...(opciones.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...opciones.headers,
    },
  });
  if (!respuesta.ok) return fallar(respuesta, redirigir401);
  if (respuesta.status === 204) return undefined as T;
  const texto = await respuesta.text();
  return texto ? (JSON.parse(texto) as T) : (undefined as T);
}

/** Descarga un archivo de texto; el nombre sale de `Content-Disposition` (solo caracteres seguros). */
export async function solicitarArchivo(
  ruta: string,
  nombrePorDefecto: string,
): Promise<{ nombre: string; contenido: string }> {
  const respuesta = await fetch(`/api${ruta}`, { credentials: 'include' });
  if (!respuesta.ok) return fallar(respuesta, true);
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  const nombre = /filename="([A-Za-z0-9._-]+)"/.exec(disposicion)?.[1] ?? nombrePorDefecto;
  return { nombre, contenido: await respuesta.text() };
}
