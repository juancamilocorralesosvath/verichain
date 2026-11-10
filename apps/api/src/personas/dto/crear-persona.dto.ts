import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

/** trim + NFC antes de validar (core no normaliza: lo hace la API al recibir la entrada). */
const normalizar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFC') : value;

export class CrearPersonaDto {
  @Transform(normalizar)
  @IsString()
  @Matches(/^\d{6,10}$/, { message: 'cedula debe tener entre 6 y 10 dígitos' })
  cedula!: string;

  @Transform(normalizar)
  @IsString()
  @Length(2, 100)
  @Matches(/^[\p{L}\p{M}' -]+$/u, {
    message: "nombre solo admite letras, espacios, tildes, ñ, ' y -",
  })
  nombre!: string;

  @Transform(normalizar)
  @IsString()
  @Length(5, 150)
  direccion!: string;

  @Transform(normalizar)
  @IsString()
  @Matches(/^\+?\d{7,15}$/, { message: 'telefono debe ser numérico (7 a 15 dígitos, + opcional)' })
  telefono!: string;
}
