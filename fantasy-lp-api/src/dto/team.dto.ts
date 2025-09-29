import { IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpsertTeamDto {
  @IsOptional()
  @IsInt()
  leagueId?: number;

  @IsOptional()
  @IsString()
  leaguepediaTeamPage?: string | null;

  @IsString()
  teamName: string;

  @IsOptional()
  @IsString()
  short?: string | null;

  @IsOptional()
  @IsString()
  region?: string | null;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsString()
  logoFile?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'logoUrl must be a valid URL' })
  logoUrl?: string | null;
}
