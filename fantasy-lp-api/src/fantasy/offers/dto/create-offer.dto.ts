// src/fantasy/offers/dto/create-offer.dto.ts
import { IsInt, Min } from 'class-validator';
export class CreateOfferDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() playerId: number;
  @IsInt() fromTeamId: number;
  @IsInt() toTeamId: number;
  @IsInt() @Min(1) amount: number;
}