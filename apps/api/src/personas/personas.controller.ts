import { Controller, Get, Req } from '@nestjs/common';
import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/permisos.js';
import { CadenaService } from '../cadena/cadena.service.js';

// La creación de personas va por /api/bloques (preparar → firmar → confirmar, H5.3).
@Controller('personas')
export class PersonasController {
  constructor(private readonly cadena: CadenaService) {}

  @Get()
  @Roles('registrador', 'auditor')
  listar(@Req() req: SolicitudAutenticada) {
    return this.cadena.listarPersonasVisibles(req.identidad.rol);
  }
}
