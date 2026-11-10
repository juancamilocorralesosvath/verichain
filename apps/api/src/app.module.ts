import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CadenaModule } from './cadena/cadena.module.js';
import { PersonasModule } from './personas/personas.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SaludController } from './salud/salud.controller.js';

@Module({
  imports: [
    // 100 solicitudes por minuto por IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CadenaModule,
    PersonasModule,
  ],
  controllers: [SaludController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
