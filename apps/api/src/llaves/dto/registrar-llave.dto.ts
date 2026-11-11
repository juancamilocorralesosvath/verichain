import { IsString, Matches, MaxLength } from 'class-validator';

export class RegistrarLlaveDto {
  // Una llave P-256 en SPKI DER mide 91 bytes (124 caracteres en base64).
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'spki_b64 debe ser base64' })
  spki_b64!: string;
}
