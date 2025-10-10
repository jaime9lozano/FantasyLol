// src/fantasy/leagues/dto/join-league.dto.ts
import { IsString, Length } from 'class-validator';

export class JoinLeagueDto {
  @IsString() inviteCode: string;
  @IsString() @Length(3, 30) teamName: string;
}