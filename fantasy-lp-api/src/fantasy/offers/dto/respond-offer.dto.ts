// src/fantasy/offers/dto/respond-offer.dto.ts
import { IsBoolean } from 'class-validator';
export class RespondOfferDto {
  @IsBoolean() accept: boolean;
}