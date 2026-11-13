import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alerta, Campo, Hash, Insignia, Tabla, abreviarHash } from '../src/ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const H = 'a'.repeat(64);

describe('componentes base', () => {
  it('Hash: abrevia, deja el completo en el tooltip y copia al portapapeles', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: escribir } });
    render(<Hash valor={H} />);
    const valor = screen.getByTitle(H);
    expect(valor.textContent).toBe(abreviarHash(H));
    fireEvent.click(screen.getByRole('button', { name: /copiar hash/i }));
    expect(escribir).toHaveBeenCalledWith(H);
    expect(await screen.findByRole('button', { name: /hash copiado/i })).toBeTruthy();
  });

  it('Hash: sin permiso de portapapeles no falla', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denegado')) },
    });
    render(<Hash valor={H} />);
    fireEvent.click(screen.getByRole('button', { name: /copiar hash/i }));
    expect(screen.getByRole('button', { name: /copiar hash completo/i })).toBeTruthy();
  });

  it('Insignia: el estado se dice con texto, no solo con color', () => {
    render(
      <>
        <Insignia estado="ok" />
        <Insignia estado="falla" />
        <Insignia estado="no-aplica" />
      </>,
    );
    for (const t of ['ok', 'falla', 'no aplica']) expect(screen.getByText(t)).toBeTruthy();
  });

  it('Campo: etiqueta accesible y el error queda asociado al control', () => {
    render(<Campo etiqueta="Cédula" error="Obligatoria" defaultValue="" />);
    const entrada = screen.getByLabelText('Cédula');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    const alerta = screen.getByRole('alert');
    expect(entrada.getAttribute('aria-describedby')).toBe(alerta.id);
  });

  it('Alerta: los errores usan role=alert y la información role=status', () => {
    render(
      <>
        <Alerta>Falló</Alerta>
        <Alerta tipo="info">Listo</Alerta>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Falló');
    expect(screen.getByRole('status').textContent).toBe('Listo');
  });

  it('Tabla: región con desplazamiento accesible por teclado', () => {
    render(
      <Tabla etiqueta="Ejemplo">
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </Tabla>,
    );
    expect(screen.getByRole('region', { name: 'Ejemplo' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('table')).toBeTruthy();
  });
});
