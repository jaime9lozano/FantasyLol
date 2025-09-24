import { IsString, IsOptional } from 'class-validator';

export class CreateEsportsLeagueDto {
  @IsString()
  id: string;

  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  image_url?: string;
}
