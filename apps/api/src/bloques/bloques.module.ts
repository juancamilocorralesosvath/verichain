import { Module } from '@nestjs/common';
import { CadenaModule } from '../cadena/cadena.module.js';
import { BloquesController } from './bloques.controller.js';
import { BloquesService } from './bloques.service.js';

@Module({ imports: [CadenaModule], controllers: [BloquesController], providers: [BloquesService] })
export class BloquesModule {}
