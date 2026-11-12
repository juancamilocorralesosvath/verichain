import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/permisos.js';
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
  ejecutar(@Param('id') id: string, @Body() dto: EjecutarAtaqueDto) {
    return this.ataques.ejecutar(id, dto.indice);
  }
}
