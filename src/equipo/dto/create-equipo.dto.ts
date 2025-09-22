import { IsString, IsNotEmpty, IsUrl, IsDateString, IsOptional, IsNumber } from 'class-validator';

export class CreateEquipoDto {
  @IsString()
  @IsNotEmpty()
  team_name: string;

  @IsString()
  @IsNotEmpty()
  acronym: string;

  @IsUrl()
  logo_url: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsDateString()
  founded_year?: string;

  @IsOptional()
  @IsString()
  coach_name?: string;

  @IsNumber()
  Region_id: number;
}

