// src/fantasy/valuation/dto/pay-clause.dto.ts
import { IsInt, IsOptional, IsISO8601 } from 'class-validator';
export class PayClauseDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() playerId: number;
  @IsInt() toTeamId: number;
  @IsOptional()
  @IsISO8601()
  effectiveAt?: string; // Fecha efectiva (para tests / retroactividad controlada)
}