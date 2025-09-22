import { PartialType } from '@nestjs/mapped-types';
import { CreateEquipoDto } from './create-equipo.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateEquipoDto extends PartialType(CreateEquipoDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;
}

