import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { FiltroExcepciones } from './comun/filtro-excepciones.js';

/** Seguridad por defecto (diseño §6). La usan `main.ts` y las pruebas e2e. */
export function configurarApp(app: INestApplication, webOrigin: string): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  // Solo se refleja el origen exacto del frontend; cualquier otro no recibe cabeceras CORS.
  app.enableCors({
    origin: (
      origen: string | undefined,
      callback: (err: Error | null, permitido?: string | false) => void,
    ) => callback(null, origen === webOrigin ? webOrigin : false),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new FiltroExcepciones());
}
