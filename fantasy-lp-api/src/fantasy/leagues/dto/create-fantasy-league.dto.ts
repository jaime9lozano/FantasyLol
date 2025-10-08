// src/fantasy/leagues/dto/create-fantasy-league.dto.ts
import { IsString, IsOptional, IsNumber, Length } from 'class-validator';

export class CreateFantasyLeagueDto {
  @IsString() @Length(3, 50) name: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() marketCloseTime?: string; // 'HH:mm'
  @IsOptional() @IsNumber() initialBudget?: number;
  @IsOptional() @IsNumber() clauseMultiplier?: number;
  @IsOptional() scoringConfig?: Record<string, any>;
  @IsOptional() rosterConfig?: { slots: string[]; bench: number; };
  // Código de la liga (ej: 'LEC','LCK','LPL'); si se omite se podrá asignar luego.
  @IsOptional() @IsString() sourceLeagueCode?: string;
  // ID de la liga core (public.league.id). Si se proporciona, tendrá prioridad sobre el code.
  @IsOptional() @IsNumber() sourceLeagueId?: number;
}
