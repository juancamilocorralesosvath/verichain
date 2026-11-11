import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SolicitudAutenticada } from './jwt-auth.guard.js';
import { ROLES } from './permisos.js';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const req = context.switchToHttp().getRequest<SolicitudAutenticada>();
    return roles.includes(req.identidad?.rol);
  }
}
