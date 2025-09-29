import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator';

export class UpsertTeamPlayerMembershipDto {
  @IsInt()
  teamId: number;

  @IsInt()
  playerId: number;

  @IsOptional()
  @IsInt()
  mainRoleId?: number | null;

  @IsBoolean()
  isCurrent: boolean;

  @IsBoolean()
  isSubstitute: boolean;

  @IsOptional()
  @IsDateString()
  lastSeenUtc?: string | null;

  @IsOptional()
  @IsDateString()
  firstSeenUtc?: string | null;

  @IsOptional()
  gamesWindow?: number;
}