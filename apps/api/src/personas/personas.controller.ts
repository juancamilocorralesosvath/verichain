import { Body, Controller, Get, Post } from '@nestjs/common';
import { CadenaService } from '../cadena/cadena.service.js';
import { CrearPersonaDto } from './dto/crear-persona.dto.js';

// Público por ahora: H3.2 le pone guards por rol.
@Controller('personas')
export class PersonasController {
  constructor(private readonly cadena: CadenaService) {}

  @Post()
  crear(@Body() dto: CrearPersonaDto) {
    return this.cadena.agregarPersona(dto);
  }

  @Get()
  listar() {
    return this.cadena.listarPersonas();
  }
}
