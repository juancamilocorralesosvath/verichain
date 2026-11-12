import { Body, Controller, Post, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { CrearPersonaDto } from '../personas/dto/crear-persona.dto.js';
import { BloquesService } from './bloques.service.js';
import { ConfirmarBloqueDto } from './dto/confirmar-bloque.dto.js';

@Controller('bloques')
export class BloquesController {
  constructor(private readonly bloques: BloquesService) {}

  @Post('preparar')
  @Roles('registrador')
  preparar(@Body() dto: CrearPersonaDto, @Req() req: SolicitudAutenticada) {
    return this.bloques.preparar(req.identidad.sub, req.identidad.username, dto, contextoDe(req));
  }

  @Post('confirmar')
  @Roles('registrador')
  confirmar(@Body() dto: ConfirmarBloqueDto, @Req() req: SolicitudAutenticada) {
    return this.bloques.confirmar(req.identidad.sub, dto, contextoDe(req));
  }
}
