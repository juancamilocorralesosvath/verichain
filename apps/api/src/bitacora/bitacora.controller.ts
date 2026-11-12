import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/permisos.js';
import { BitacoraService } from './bitacora.service.js';
import { ConsultaBitacoraDto } from './dto/consulta-bitacora.dto.js';

@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly bitacora: BitacoraService) {}

  @Get()
  @Roles('admin', 'auditor')
  listar(@Query() consulta: ConsultaBitacoraDto) {
    return this.bitacora.listar(consulta.pagina ?? 1);
  }
}
