import { Module } from '@nestjs/common';
import { LlavesController } from './llaves.controller.js';
import { LlavesService } from './llaves.service.js';

@Module({
  controllers: [LlavesController],
  providers: [LlavesService],
  exports: [LlavesService],
})
export class LlavesModule {}
