import { IsInt, IsOptional, Min } from 'class-validator';

export class EjecutarAtaqueDto {
  /** Bloque atacado (entero entre 1 y el último; por defecto 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  indice?: number;
}
