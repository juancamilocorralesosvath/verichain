import { Controller, Get } from '@nestjs/common';
import { CadenaService } from './cadena.service.js';
import { Publico, Roles } from '../auth/permisos.js';

@Controller('cadena')
export class CadenaController {
  constructor(private readonly cadena: CadenaService) {}

  @Get()
  listar() {
    return this.cadena.listarCadena();
  }

  // Público: solo expone la clave pública del servidor y su huella.
  @Get('llave-servidor')
  @Publico()
  llaveServidor() {
    return this.cadena.llaveServidor();
  }

  @Get('verificar')
  @Roles('admin', 'auditor')
  verificar() {
    return this.cadena.verificar();
  }
}
