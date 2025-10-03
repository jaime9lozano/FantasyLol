// src/fantasy/market/dto/create-listing.dto.ts
import { IsInt, IsOptional } from 'class-validator';
export class CreateListingDto {
  @IsInt() fantasyLeagueId: number;
  @IsInt() ownerTeamId: number;
  @IsInt() playerId: number;
  @IsOptional() @IsInt() minPrice?: number;
  // cierra hoy a la hora de la liga (lo calcula el servicio) salvo que pases closesAt
}