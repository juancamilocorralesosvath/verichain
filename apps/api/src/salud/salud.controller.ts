import { Controller, Get } from '@nestjs/common';
import { CORE_VERSION } from '@bc/core';
import { Publico } from '../auth/permisos.js';

@Controller('salud')
export class SaludController {
  @Get()
  @Publico()
  salud(): { ok: true; coreVersion: string } {
    return { ok: true, coreVersion: CORE_VERSION };
  }
}
