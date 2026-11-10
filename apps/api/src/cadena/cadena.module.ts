import { Module } from '@nestjs/common';
import { CadenaController } from './cadena.controller.js';
import { CadenaService } from './cadena.service.js';

@Module({
  controllers: [CadenaController],
  providers: [CadenaService],
  exports: [CadenaService],
})
export class CadenaModule {}
