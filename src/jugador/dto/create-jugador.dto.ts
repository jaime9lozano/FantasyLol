import { IsOptional, IsString, IsInt, IsUUID, IsNumber, IsBoolean } from 'class-validator';

export class CreateJugadorDto {
  @IsOptional()
  @IsString()
  summoner_id?: string;

  @IsOptional()
  @IsUUID()
  puuid?: string;

  @IsOptional()
  @IsString()
  summoner_name?: string;

  @IsOptional()
  @IsString()
  account_id?: string;

  @IsOptional()
  @IsString()
  tier?: string;

  @IsOptional()
  @IsInt()
  league_points?: number;

  @IsInt()
  team_id: number;

  @IsInt()
  Region_id: number;

  @IsInt()
  Main_role_id: number;

  @IsOptional()
  @IsNumber()
  clausula?: number;

  @IsOptional()
  @IsString()
  esports_player_id?: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsString()
  role_esports?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}