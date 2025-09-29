import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertPlayerGameStatsDto {
  @IsInt()
  gameId: number;

  @IsInt()
  playerId: number;

  @IsOptional() @IsString() playerPageText?: string | null;
  @IsOptional() @IsString() teamText?: string | null;

  @IsOptional() @IsString() role?: string | null;
  @IsOptional() @IsString() champion?: string | null;

  @IsOptional() kills?: number | null;
  @IsOptional() deaths?: number | null;
  @IsOptional() assists?: number | null;
  @IsOptional() gold?: number | null;
  @IsOptional() cs?: number | null;

  @IsOptional() damageToChampions?: number | null;
  @IsOptional() visionScore?: number | null;

  @IsOptional() @IsBoolean() playerWin?: boolean | null;
  @IsOptional() result?: 'W' | 'L' | null;
}
