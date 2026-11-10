import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Al cliente solo llega `{ statusCode, mensaje }`: nunca la traza ni el detalle de un error interno.
 * El error completo va al Logger.
 */
@Catch()
export class FiltroExcepciones implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcepciones.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (excepcion instanceof HttpException) {
      const statusCode = excepcion.getStatus();
      if (statusCode >= 500) this.logger.error(excepcion.message, excepcion.stack);
      res.status(statusCode).json({ statusCode, mensaje: mensajeDe(excepcion) });
      return;
    }

    this.logger.error(
      excepcion instanceof Error ? excepcion.message : 'Error desconocido',
      excepcion instanceof Error ? excepcion.stack : undefined,
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, mensaje: 'Error interno del servidor' });
  }
}

function mensajeDe(excepcion: HttpException): string {
  const cuerpo = excepcion.getResponse();
  if (typeof cuerpo === 'string') return cuerpo;
  const mensaje = (cuerpo as { message?: unknown }).message;
  if (Array.isArray(mensaje)) return mensaje.map(String).join('; ');
  if (typeof mensaje === 'string') return mensaje;
  return excepcion.message;
}
