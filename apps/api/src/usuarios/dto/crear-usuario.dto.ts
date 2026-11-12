import { IsIn, IsString, Length, Matches } from 'class-validator';
import { NoIgualA } from './no-igual-a.js';

export const ROLES = ['admin', 'registrador', 'auditor'] as const;

export class CrearUsuarioDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,50}$/, {
    message:
      'username debe tener entre 3 y 50 caracteres (letras, números, punto, guion y guion bajo)',
  })
  username!: string;

  // Política: mínimo 12 caracteres y que no sea igual al usuario (el tope evita abusar de argon2).
  @IsString()
  @Length(12, 128, { message: 'password debe tener entre 12 y 128 caracteres' })
  @NoIgualA('username', { message: 'password no puede ser igual al usuario' })
  password!: string;

  @IsIn(ROLES)
  rol!: (typeof ROLES)[number];
}
