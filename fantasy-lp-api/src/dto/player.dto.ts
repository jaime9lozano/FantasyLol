import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpsertPlayerDto {
  @IsOptional()
  @IsString()
  leaguepediaPlayerId?: string | null;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  photoFile?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string | null;
}
