// src/fantasy/leagues/dto/update-league.dto.ts
import { IsOptional, IsString, IsNumber } from 'class-validator';
export class UpdateLeagueDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() marketCloseTime?: string;
  @IsOptional() @IsNumber() clauseMultiplier?: number;
  @IsOptional() scoringConfig?: Record<string, any>;
  @IsOptional() rosterConfig?: { slots: string[]; bench: number; };
  // Cambiar liga fuente (recalcula torneo activo si se indica refreshTournament=true)
  @IsOptional() @IsString() sourceLeagueCode?: string;
  @IsOptional() refreshTournament?: boolean;
}