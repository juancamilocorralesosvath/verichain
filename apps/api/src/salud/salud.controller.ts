import { Controller, Get } from '@nestjs/common';
import { CORE_VERSION } from '@bc/core';

@Controller('salud')
export class SaludController {
  @Get()
  salud(): { ok: true; coreVersion: string } {
    return { ok: true, coreVersion: CORE_VERSION };
  }
}
