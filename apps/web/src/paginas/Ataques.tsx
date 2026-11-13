import type { ReporteCadena } from '@bc/core';
import { useEffect, useState } from 'react';
import {
  catalogoAtaques,
  ejecutarAtaque,
  restaurarDemo,
  tomarSnapshot,
  type AtaqueApi,
} from '../api/admin';
import { verificarCadena } from '../api/cadena';
import { ErrorApi } from '../api/cliente';
import { ReporteVerificacion } from '../componentes/ReporteVerificacion';
import { Alerta, Boton, Campo, Tarjeta } from '../ui';

const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : 'No fue posible completar la solicitud';

type Catalogo =
  | { tipo: 'cargando' }
  | { tipo: 'apagado' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; ataques: AtaqueApi[] };

export function Ataques() {
  const [catalogo, setCatalogo] = useState<Catalogo>({ tipo: 'cargando' });
  const [indice, setIndice] = useState('1');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [reporte, setReporte] = useState<ReporteCadena | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let activo = true;
    catalogoAtaques()
      .then((ataques) => activo && setCatalogo({ tipo: 'listo', ataques }))
      .catch((e: unknown) => {
        if (!activo) return;
        // sin DEMO_MODE la API no expone las rutas (404): no se muestran los controles
        if (e instanceof ErrorApi && e.estado === 404) setCatalogo({ tipo: 'apagado' });
        else setCatalogo({ tipo: 'error', mensaje: mensajeDe(e) });
      });
    return () => {
      activo = false;
    };
  }, []);

  async function accion(tarea: () => Promise<void>) {
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      await tarea();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  }

  const atacar = (id: string) =>
    accion(async () => {
      const n = Number(indice);
      if (!Number.isInteger(n) || n < 1)
        throw new Error('El índice del bloque debe ser un entero desde 1');
      const res = await ejecutarAtaque(id, n);
      setAviso(res.detalle);
    });
  const snapshot = () =>
    accion(async () => {
      const res = await tomarSnapshot();
      setAviso(`Snapshot guardado (${res.bloques} bloques).`);
    });
  const restaurar = () => {
    if (
      !window.confirm(
        'Restaurar vuelve la base de datos al último snapshot: se pierde todo lo hecho después (también usuarios y bitácora). ¿Continuar?',
      )
    )
      return Promise.resolve();
    return accion(async () => {
      const res = await restaurarDemo();
      setReporte(res.verificacion);
      setAviso('Demo restaurada.');
    });
  };
  const verificarAhora = () =>
    accion(async () => {
      setReporte(await verificarCadena());
    });

  return (
    <main>
      <h1>Ataques</h1>
      {catalogo.tipo === 'cargando' ? (
        <p>Cargando el catálogo…</p>
      ) : catalogo.tipo === 'apagado' ? (
        <Alerta tipo="aviso">
          El modo demo no está activo en el servidor (<code>DEMO_MODE=true</code>): los ataques no
          están disponibles.
        </Alerta>
      ) : catalogo.tipo === 'error' ? (
        <Alerta>{catalogo.mensaje}</Alerta>
      ) : (
        <>
          <p>
            Simulan a alguien con acceso directo a la base de datos. Toma un snapshot antes de
            empezar y restaura entre ataque y ataque.
          </p>
          <Tarjeta aria-label="Controles de la demo">
            <Campo
              etiqueta="Índice del bloque"
              type="number"
              min={1}
              value={indice}
              onChange={(e) => setIndice(e.target.value)}
            />
            <Boton variante="secundario" onClick={() => void snapshot()} disabled={ocupado}>
              Tomar snapshot
            </Boton>
            <Boton variante="secundario" onClick={() => void verificarAhora()} disabled={ocupado}>
              Verificar ahora
            </Boton>
            <Boton variante="peligro" onClick={() => void restaurar()} disabled={ocupado}>
              Restaurar demo
            </Boton>
          </Tarjeta>
          {error && <Alerta>{error}</Alerta>}
          {aviso && <Alerta tipo="info">{aviso}</Alerta>}
          {catalogo.ataques.map((a) => (
            <Tarjeta key={a.id} aria-label={a.nombre}>
              <h2>{a.nombre}</h2>
              <p>{a.descripcion}</p>
              <p>
                <strong>Debería detectarlo:</strong> {a.deteccionEsperada}
              </p>
              <Boton
                variante="peligro"
                aria-label={`Ejecutar ataque: ${a.nombre}`}
                onClick={() => void atacar(a.id)}
                disabled={ocupado}
              >
                Ejecutar ataque
              </Boton>
            </Tarjeta>
          ))}
          {reporte && <ReporteVerificacion reporte={reporte} />}
        </>
      )}
    </main>
  );
}
