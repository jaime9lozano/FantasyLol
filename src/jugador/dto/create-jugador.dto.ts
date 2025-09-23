import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, IsNumber } from 'class-validator';

export class CreateJugadorDto {
  @IsString()
  @IsNotEmpty()
  summoner_id: string;

  @IsUUID()
  puuid: string;

  @IsString()
  @IsNotEmpty()
  summoner_name: string;

  @IsString()
  @IsNotEmpty()
  account_id: string;

  @IsOptional()
  @IsString()
  tier?: string;

  @IsOptional()
  @IsInt()
  league_points?: number;

  @IsNumber()
  team_id: number;

  @IsNumber()
  Region_id: number;

  @IsNumber()
  Main_role_id: number;

  @IsOptional()
  @IsNumber()
  clausula?: number;
}

