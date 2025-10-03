// src/fantasy/scoring/dto/compute-period.dto.ts
import { IsInt } from 'class-validator';
export class ComputePeriodDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() periodId: number;
}
