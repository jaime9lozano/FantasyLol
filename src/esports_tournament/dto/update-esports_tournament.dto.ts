import { PartialType } from '@nestjs/mapped-types';
import { CreateEsportsTournamentDto } from './create-esports_tournament.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateEsportsTournamentDto extends PartialType(CreateEsportsTournamentDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;
}
