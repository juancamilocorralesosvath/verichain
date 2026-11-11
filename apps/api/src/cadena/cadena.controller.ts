import { Controller, Get } from '@nestjs/common';
import { CadenaService } from './cadena.service.js';
import { Roles } from '../auth/permisos.js';

@Controller('cadena')
export class CadenaController {
  constructor(private readonly cadena: CadenaService) {}

  @Get()
  listar() {
    return this.cadena.listarCadena();
  }

  @Get('verificar')
  @Roles('admin', 'auditor')
  verificar() {
    return this.cadena.verificar();
  }
}
