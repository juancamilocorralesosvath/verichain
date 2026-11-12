import { Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/permisos.js';
import { DemoService } from './demo.service.js';

/** Solo existe con DEMO_MODE=true y solo para el admin. */
@Controller('demo')
@Roles('admin')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('snapshot')
  snapshot() {
    return this.demo.snapshot();
  }

  @Post('restaurar')
  restaurar() {
    return this.demo.restaurar();
  }
}
