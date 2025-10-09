import { IsInt } from 'class-validator';

export class SellToLeagueDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() teamId: number;
  @IsInt() playerId: number;
}
