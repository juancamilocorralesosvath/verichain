import { Module } from '@nestjs/common';
import { CadenaController } from './cadena.controller.js';
import { CadenaService } from './cadena.service.js';
import { CifradoService } from '../cripto/cifrado.service.js';
import { LlavesModule } from '../llaves/llaves.module.js';

@Module({
  imports: [LlavesModule],
  controllers: [CadenaController],
  providers: [
    CadenaService,
    { provide: CifradoService, useFactory: () => new CifradoService(process.env['DATA_KEY']) },
  ],
  exports: [CadenaService],
})
export class CadenaModule {}
