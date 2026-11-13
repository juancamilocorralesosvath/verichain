import type { ReporteCadena } from '@bc/core';
import { useState } from 'react';
import { verificarCadena } from '../api/cadena';
import { ReporteVerificacion } from '../componentes/ReporteVerificacion';
import { Alerta, Boton } from '../ui';

export function Verificar() {
  const [reporte, setReporte] = useState<ReporteCadena | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function verificar() {
    setCargando(true);
    setError('');
    try {
      setReporte(await verificarCadena());
    } catch (e) {
      setReporte(null);
      setError(e instanceof Error ? e.message : 'No fue posible verificar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main>
      <h1>Verificar</h1>
      <Boton onClick={() => void verificar()} disabled={cargando}>
        Verificar integridad
      </Boton>
      {cargando && <p>Verificando la cadena…</p>}
      {error && <Alerta>{error}</Alerta>}
      {reporte ? (
        <ReporteVerificacion reporte={reporte} />
      ) : (
        !cargando && !error && <p>Aún no se ha verificado la cadena.</p>
      )}
    </main>
  );
}
