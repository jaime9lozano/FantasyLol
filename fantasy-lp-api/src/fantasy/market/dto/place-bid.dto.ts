// src/fantasy/market/dto/place-bid.dto.ts
import { IsInt, Min, IsOptional } from 'class-validator';
export class PlaceBidDto {
  @IsInt() marketOrderId: number;
  @IsOptional()
  @IsInt()
  bidderTeamId?: number;
  @IsInt() @Min(1) amount: number;
}