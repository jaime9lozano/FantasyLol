import { IsOptional, IsString, IsInt, IsUUID, IsNumber, IsBoolean } from 'class-validator';

export class CreateJugadorDto {
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
  last_name?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  summoner_name?: string;

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