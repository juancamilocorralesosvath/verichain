import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { AtaquesService } from './ataques.service.js';
import { EjecutarAtaqueDto } from './dto/ejecutar-ataque.dto.js';

/** Solo existe con DEMO_MODE=true y solo para el admin. */
@Controller('ataques')
@Roles('admin')
export class AtaquesController {
  constructor(private readonly ataques: AtaquesService) {}

  @Get()
  catalogo() {
    return this.ataques.catalogo();
  }

  @Post(':id')
  ejecutar(
    @Param('id') id: string,
    @Body() dto: EjecutarAtaqueDto,
    @Req() req: SolicitudAutenticada,
  ) {
    return this.ataques.ejecutar(id, dto.indice, contextoDe(req));
  }
}
