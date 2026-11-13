import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ConfirmarBloqueDto } from './confirmar-bloque.dto.js';

export class ConfirmarLoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfirmarBloqueDto)
  items!: ConfirmarBloqueDto[];
}
