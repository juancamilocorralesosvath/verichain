import { Controller, Post, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { DemoService } from './demo.service.js';

/** Solo existe con DEMO_MODE=true y solo para el admin. */
@Controller('demo')
@Roles('admin')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('snapshot')
  snapshot(@Req() req: SolicitudAutenticada) {
    return this.demo.snapshot(contextoDe(req));
  }

  @Post('restaurar')
  restaurar(@Req() req: SolicitudAutenticada) {
    return this.demo.restaurar(contextoDe(req));
  }
}
