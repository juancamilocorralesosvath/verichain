import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { contextoDe } from '../bitacora/contexto.js';
import { CrearPersonaDto } from '../personas/dto/crear-persona.dto.js';
import { BloquesService } from './bloques.service.js';
import { ConfirmarBloqueDto } from './dto/confirmar-bloque.dto.js';
import { ConfirmarLoteDto } from './dto/confirmar-lote.dto.js';

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

  @Post('preparar-lote')
  @Roles('registrador')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 200 * 1024 } }))
  prepararLote(@UploadedFile() archivo: Express.Multer.File | undefined, @Req() req: SolicitudAutenticada) {
    if (!archivo || archivo.mimetype !== 'text/csv' || !archivo.originalname.toLowerCase().endsWith('.csv')) throw new BadRequestException('Archivo CSV inválido');
    return this.bloques.prepararLote(req.identidad.sub, req.identidad.username, archivo.buffer, contextoDe(req));
  }

  @Post('confirmar-lote')
  @Roles('registrador')
  confirmarLote(@Body() dto: ConfirmarLoteDto, @Req() req: SolicitudAutenticada) {
    return this.bloques.confirmarLote(req.identidad.sub, dto.items, contextoDe(req));
  }
}
