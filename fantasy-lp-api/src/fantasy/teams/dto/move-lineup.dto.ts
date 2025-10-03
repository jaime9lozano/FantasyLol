// src/fantasy/teams/dto/move-lineup.dto.ts
import { IsInt, IsBoolean, IsString } from 'class-validator';
export class MoveLineupDto {
  @IsInt() rosterSlotId: number;
  @IsString() slot: 'TOP'|'JNG'|'MID'|'ADC'|'SUP'|'BENCH';
  @IsBoolean() starter: boolean;
}
