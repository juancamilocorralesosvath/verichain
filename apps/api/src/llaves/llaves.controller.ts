import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { RegistrarLlaveDto } from './dto/registrar-llave.dto.js';
import { LlavesService } from './llaves.service.js';

@Controller('llaves')
export class LlavesController {
  constructor(private readonly llaves: LlavesService) {}

  @Post()
  @Roles('registrador')
  registrar(@Body() dto: RegistrarLlaveDto, @Req() req: SolicitudAutenticada) {
    return this.llaves.registrar(req.identidad.sub, dto.spki_b64, contextoDe(req));
  }

  @Get('mias')
  @Roles('registrador')
  mias(@Req() req: SolicitudAutenticada) {
    return this.llaves.mias(req.identidad.sub);
  }

  @Get('pendientes')
  @Roles('admin')
  pendientes() {
    return this.llaves.pendientes();
  }

  @Post(':id/aprobar')
  @Roles('admin')
  @HttpCode(200)
  aprobar(@Param('id', ParseIntPipe) id: number, @Req() req: SolicitudAutenticada) {
    return this.llaves.aprobar(req.identidad.sub, id, contextoDe(req));
  }

  @Post(':id/rechazar')
  @Roles('admin')
  @HttpCode(200)
  rechazar(@Param('id', ParseIntPipe) id: number, @Req() req: SolicitudAutenticada) {
    return this.llaves.rechazar(id, contextoDe(req));
  }
}
