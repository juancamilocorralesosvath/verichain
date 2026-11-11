import { Module } from '@nestjs/common';
import { CadenaController } from './cadena.controller.js';
import { CadenaService } from './cadena.service.js';
import { CifradoService } from '../cripto/cifrado.service.js';
import { FirmaServidorService } from '../cripto/firma-servidor.service.js';
import { LlavesModule } from '../llaves/llaves.module.js';

@Module({
  imports: [LlavesModule],
  controllers: [CadenaController],
  providers: [
    CadenaService,
    { provide: CifradoService, useFactory: () => new CifradoService(process.env['DATA_KEY']) },
    // sin la llave del servidor la API no arranca (el error nombra el script que la genera)
    { provide: FirmaServidorService, useFactory: () => FirmaServidorService.desdeEntorno() },
  ],
  exports: [CadenaService],
})
export class CadenaModule {}
