// src/fantasy/market/market.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CreateListingDto } from './dto/create-listing.dto';

@Controller('fantasy/market')
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @Post('listing')
  createListing(@Body() dto: CreateListingDto) {
    return this.svc.createListing(dto);
  }

  @Post('bid')
  placeBid(@Body() dto: PlaceBidDto) {
    return this.svc.placeBid(dto);
  }

  // /diag: cierra subastas vencidas (debug manual)
  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@Query('leagueId') leagueId: string) {
    return this.svc.closeDailyAuctions(Number(leagueId));
  }
}
