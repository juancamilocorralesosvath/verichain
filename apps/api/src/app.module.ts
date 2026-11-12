import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AtaquesModule } from './ataques/ataques.module.js';
import { esModoDemo } from './ataques/modo-demo.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { BloquesModule } from './bloques/bloques.module.js';
import { CadenaModule } from './cadena/cadena.module.js';
import { LlavesModule } from './llaves/llaves.module.js';
import { PersonasModule } from './personas/personas.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SaludController } from './salud/salud.controller.js';

@Module({
  imports: [
    // 100 solicitudes por minuto por IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    CadenaModule,
    BloquesModule,
    // el módulo de ataques solo se registra con DEMO_MODE=true: si no, sus rutas no existen
    ...(esModoDemo() ? [AtaquesModule] : []),
    LlavesModule,
    PersonasModule,
  ],
  controllers: [SaludController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
