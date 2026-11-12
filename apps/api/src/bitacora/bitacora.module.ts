import { Global, Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller.js';
import { BitacoraService } from './bitacora.service.js';

/** Global: cualquier módulo puede registrar en la bitácora sin importarla. */
@Global()
@Module({
  controllers: [BitacoraController],
  providers: [BitacoraService],
  exports: [BitacoraService],
})
export class BitacoraModule {}
