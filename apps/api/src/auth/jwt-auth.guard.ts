import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { AuthService, type Identidad } from './auth.service.js';
import { PUBLICO } from './permisos.js';

export type SolicitudAutenticada = Request & { identidad: Identidad };
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLICO, [context.getHandler(), context.getClass()])
    )
      return true;
    const req = context.switchToHttp().getRequest<SolicitudAutenticada>();
    const cookie = req.headers.cookie
      ?.split(';')
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith('sesion='));
    if (!cookie) throw new UnauthorizedException('Sesión inválida');
    req.identidad = await this.auth.autenticar(cookie.slice('sesion='.length));
    return true;
  }
}
