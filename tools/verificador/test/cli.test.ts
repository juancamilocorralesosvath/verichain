import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReporteCadena } from '@bc/core';
import { ejecutar } from '../src/ejecutar.js';

const F = join(import.meta.dirname, 'fixtures');
const VALIDA = join(F, 'cadena-valida.json');
const ALTERADA = join(F, 'cadena-alterada.json');
const PEM = join(F, 'server-public.pem');
const OTRA = join(F, 'otra-llave-public.pem');

async function correr(args: string[]): Promise<{ codigo: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const codigo = await ejecutar(args, { out: (t) => out.push(t), err: (t) => err.push(t) });
  return { codigo, out: out.join(''), err: err.join('') };
}
const temporal = (nombre: string, contenido: string): string => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'bc-verif-')), nombre);
  writeFileSync(ruta, contenido);
  return ruta;
};

describe('verificador (en proceso)', () => {
  it('cadena válida con la llave fijada: código 0, veredicto íntegro y sin advertencias', async () => {
    const r = await correr([VALIDA, '--server-key', PEM]);
    expect(r.codigo).toBe(0);
    expect(r.out).toMatch(/CADENA ÍNTEGRA/);
    expect(r.out).toMatch(/Sello del servidor: ✔/);
    expect(r.out).toContain('✔');
    expect(r.out).not.toContain('✘');
    expect(r.err).toBe('');
    // una fila por bloque (génesis + 3)
    for (const i of [0, 1, 2, 3]) expect(r.out).toMatch(new RegExp(`^\\s*${i}\\s`, 'm'));
  });

  it('cadena alterada: código 1, marca el bloque roto y explica el motivo en español', async () => {
    const r = await correr([ALTERADA, '--server-key', PEM]);
    expect(r.codigo).toBe(1);
    expect(r.out).toMatch(/CADENA COMPROMETIDA/);
    expect(r.out).toMatch(/primer bloque roto: 2/i);
    expect(r.out).toContain('✘');
    expect(r.out).toMatch(/Bloque 2:.*datos de la persona/);
  });

  it('con una llave del servidor distinta: código 1, advertencia de huella y siempre se usa la fijada', async () => {
    const r = await correr([VALIDA, '--server-key', OTRA]);
    expect(r.codigo).toBe(1);
    expect(r.err).toMatch(/ADVERTENCIA/);
    expect(r.err).toMatch(/huella/i);
    expect(r.out).toMatch(/Sello del servidor: ✘/);
    expect(r.out).toMatch(/COMPROMETIDA/);
  });

  it('--json imprime solo el ReporteCadena crudo en stdout', async () => {
    const ok = await correr([VALIDA, '--server-key', PEM, '--json']);
    expect(ok.codigo).toBe(0);
    const reporte = JSON.parse(ok.out) as ReporteCadena;
    expect(reporte.valida).toBe(true);
    expect(reporte.totalBloques).toBe(4);
    expect(reporte.sello.estado).toBe('ok');
    const mal = await correr([ALTERADA, '--server-key', PEM, '--json']);
    expect(mal.codigo).toBe(1);
    expect((JSON.parse(mal.out) as ReporteCadena).primerBloqueRoto).toBe(2);
  });

  it('en --json la advertencia va a stderr y no rompe el JSON', async () => {
    const r = await correr([VALIDA, '--server-key', OTRA, '--json']);
    expect(r.err).toMatch(/ADVERTENCIA/);
    expect(() => JSON.parse(r.out)).not.toThrow();
  });

  it('--help muestra el uso y sale con 0', async () => {
    const r = await correr(['--help']);
    expect(r.codigo).toBe(0);
    expect(r.out).toMatch(/verificador <cadena\.json> --server-key/);
  });

  it.each([
    ['sin argumentos', [], /uso/i],
    ['sin --server-key', [VALIDA], /server-key/],
    ['opción desconocida', [VALIDA, '--server-key', PEM, '--nada'], /opción/i],
    ['dos archivos de cadena', [VALIDA, VALIDA, '--server-key', PEM], /uso/i],
    ['archivo de cadena inexistente', ['/no/existe.json', '--server-key', PEM], /no se pudo leer/i],
    ['PEM inexistente', [VALIDA, '--server-key', '/no/existe.pem'], /no se pudo leer/i],
  ])('error de uso o de archivo (%s): código 2 con mensaje claro', async (_n, args, mensaje) => {
    const r = await correr(args as string[]);
    expect(r.codigo).toBe(2);
    expect(r.err).toMatch(mensaje);
    expect(r.out).toBe('');
  });

  it('un JSON que no es JSON o con formato desconocido da código 2', async () => {
    const roto = await correr([temporal('x.json', '{ no es json'), '--server-key', PEM]);
    expect(roto.codigo).toBe(2);
    expect(roto.err).toMatch(/JSON/);
    const formato = await correr([
      temporal('y.json', JSON.stringify({ formato: 'otro/1' })),
      '--server-key',
      PEM,
    ]);
    expect(formato.codigo).toBe(2);
    expect(formato.err).toMatch(/formato/i);
  });

  it('un PEM que no es una llave pública P-256 da código 2', async () => {
    const r = await correr([VALIDA, '--server-key', temporal('k.pem', 'no soy un pem')]);
    expect(r.codigo).toBe(2);
    expect(r.err).toMatch(/llave/i);
  });
});

describe('binario compilado (npm run build)', () => {
  const BIN = join(import.meta.dirname, '../dist/cli.js');
  const ejecutarBin = (...args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

  it('códigos de salida 0, 1, 1 y 2', () => {
    expect(ejecutarBin(VALIDA, '--server-key', PEM).status).toBe(0);
    expect(ejecutarBin(ALTERADA, '--server-key', PEM).status).toBe(1);
    const otra = ejecutarBin(VALIDA, '--server-key', OTRA);
    expect(otra.status).toBe(1);
    expect(otra.stderr).toMatch(/ADVERTENCIA/);
    expect(ejecutarBin().status).toBe(2);
  });
});
