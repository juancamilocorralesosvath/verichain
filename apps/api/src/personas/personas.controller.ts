import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/permisos.js';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { CadenaService } from '../cadena/cadena.service.js';
import { CrearPersonaDto } from './dto/crear-persona.dto.js';

@Controller('personas')
export class PersonasController {
  constructor(private readonly cadena: CadenaService) {}

  @Post()
  @Roles('registrador')
  crear(@Body() dto: CrearPersonaDto, @Req() req: SolicitudAutenticada) {
    return this.cadena.agregarPersona(dto, req.identidad.username);
  }

  @Get()
  @Roles('registrador', 'auditor')
  listar() {
    return this.cadena.listarPersonas();
  }
}
