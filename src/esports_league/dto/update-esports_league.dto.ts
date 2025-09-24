import { PartialType } from '@nestjs/mapped-types';
import { CreateEsportsLeagueDto } from './create-esports_league.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateEsportsLeagueDto extends PartialType(CreateEsportsLeagueDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;
}
