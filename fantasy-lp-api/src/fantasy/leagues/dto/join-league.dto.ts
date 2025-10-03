// src/fantasy/leagues/dto/join-league.dto.ts
import { IsInt, IsString, Length } from 'class-validator';

export class JoinLeagueDto {
  @IsInt() fantasyManagerId: number;
  @IsString() inviteCode: string;
  @IsString() @Length(3, 30) teamName: string;
}