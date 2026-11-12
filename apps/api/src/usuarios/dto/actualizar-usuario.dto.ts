import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ROLES } from './crear-usuario.dto.js';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsIn(ROLES)
  rol?: (typeof ROLES)[number];
}
