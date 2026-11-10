import { Controller, Get } from '@nestjs/common';
import { CadenaService } from './cadena.service.js';

@Controller('cadena')
export class CadenaController {
  constructor(private readonly cadena: CadenaService) {}

  @Get()
  listar() {
    return this.cadena.listarCadena();
  }

  // Público por ahora: H3.2 le pone guards por rol.
  @Get('verificar')
  verificar() {
    return this.cadena.verificar();
  }
}
