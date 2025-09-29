import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertGameDto {
  @IsString()
  leaguepediaGameId: string;

  @IsDateString()
  datetimeUtc: string; // ISO

  @IsOptional() @IsInt() tournamentId?: number | null;
  @IsOptional() @IsString() tournamentName?: string | null;
  @IsOptional() @IsString() overviewPage?: string | null;
  @IsOptional() @IsString() patch?: string | null;

  @IsOptional() @IsString() team1Text?: string | null;
  @IsOptional() @IsString() team2Text?: string | null;
  @IsOptional() @IsString() winTeamText?: string | null;
  @IsOptional() @IsString() lossTeamText?: string | null;
  @IsOptional() winnerNumber?: 1 | 2 | null;

  @IsOptional() @IsInt() team1Id?: number | null;
  @IsOptional() @IsInt() team2Id?: number | null;
  @IsOptional() @IsInt() winnerTeamId?: number | null;
}