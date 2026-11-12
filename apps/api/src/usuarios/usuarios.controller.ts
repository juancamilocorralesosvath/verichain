import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

/** Solo el admin gestiona usuarios. */
@Controller('usuarios')
@Roles('admin')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @Req() req: SolicitudAutenticada) {
    return this.usuarios.crear(dto, contextoDe(req));
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarUsuarioDto,
    @Req() req: SolicitudAutenticada,
  ) {
    return this.usuarios.actualizar(id, dto, req.identidad.sub, contextoDe(req));
  }
}
