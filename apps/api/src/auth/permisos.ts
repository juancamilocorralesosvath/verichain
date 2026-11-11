import { SetMetadata } from '@nestjs/common';
export const PUBLICO = 'publico';
export const ROLES = 'roles';
export const Publico = () => SetMetadata(PUBLICO, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);
