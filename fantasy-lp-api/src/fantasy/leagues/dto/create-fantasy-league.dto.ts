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
}
