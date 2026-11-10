import { Controller, Get } from '@nestjs/common';
import { CadenaService } from './cadena.service.js';

@Controller('cadena')
export class CadenaController {
  constructor(private readonly cadena: CadenaService) {}

  @Get()
  listar() {
    return this.cadena.listarCadena();
  }
}
