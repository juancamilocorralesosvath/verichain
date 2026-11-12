import { Module } from '@nestjs/common';
import { CadenaModule } from '../cadena/cadena.module.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

@Module({ imports: [CadenaModule], controllers: [DemoController], providers: [DemoService] })
export class DemoModule {}
