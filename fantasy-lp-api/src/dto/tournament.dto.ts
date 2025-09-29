import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertTournamentDto {
  @IsString()
  overviewPage: string;

  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsString() league?: string | null;
  @IsOptional() @IsString() region?: string | null;
  @IsOptional() @IsInt()    year?: number | null;
  @IsOptional() @IsBoolean() isOfficial?: boolean | null;
  @IsOptional() @IsDateString() dateStart?: string | null;
  @IsOptional() @IsDateString() dateEnd?: string | null;
  @IsOptional() @IsString() split?: string | null;
  @IsOptional() @IsString() tournamentLevel?: string | null;
  @IsOptional() @IsString() leagueIconKey?: string | null;
}
