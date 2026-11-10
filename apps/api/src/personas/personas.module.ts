import { Module } from '@nestjs/common';
import { CadenaModule } from '../cadena/cadena.module.js';
import { PersonasController } from './personas.controller.js';

@Module({ imports: [CadenaModule], controllers: [PersonasController] })
export class PersonasModule {}
