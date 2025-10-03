// src/fantasy/market/dto/place-bid.dto.ts
import { IsInt, Min } from 'class-validator';
export class PlaceBidDto {
  @IsInt() marketOrderId: number;
  @IsInt() bidderTeamId: number;
  @IsInt() @Min(1) amount: number;
}