import { PartialType } from '@nestjs/mapped-types';
import { CreateJugadorDto } from './create-jugador.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateJugadorDto extends PartialType(CreateJugadorDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;
}

