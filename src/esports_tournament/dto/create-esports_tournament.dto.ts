import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateEsportsTournamentDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  league_id: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
