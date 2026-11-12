import { Module } from '@nestjs/common';
import { CadenaModule } from '../cadena/cadena.module.js';
import { AtaquesController } from './ataques.controller.js';
import { AtaquesService } from './ataques.service.js';

@Module({ imports: [CadenaModule], controllers: [AtaquesController], providers: [AtaquesService] })
export class AtaquesModule {}
