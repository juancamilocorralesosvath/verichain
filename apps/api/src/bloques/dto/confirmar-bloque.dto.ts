import { IsInt, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

export class ConfirmarBloqueDto {
  @IsUUID()
  borrador_id!: string;

  @IsInt()
  @Min(1)
  llave_id!: number;

  // Una firma ECDSA P-256 en formato P1363 mide 64 bytes (88 caracteres en base64).
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'firma_b64 debe ser base64' })
  firma_b64!: string;
}
