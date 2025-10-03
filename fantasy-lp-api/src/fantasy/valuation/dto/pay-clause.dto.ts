// src/fantasy/valuation/dto/pay-clause.dto.ts
import { IsInt } from 'class-validator';
export class PayClauseDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() playerId: number;
  @IsInt() toTeamId: number;
}