// src/fantasy/market/market.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { MarketService } from './market.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { SellToLeagueDto } from './dto/sell-to-league.dto';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt.guard';
import { MembershipGuard } from '../../auth/membership.guard';

@Controller('fantasy/market')
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('listing')
  createListing(@Body() dto: CreateListingDto) {
    return this.svc.createListing(dto);
  }

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('bid')
  placeBid(@Body() dto: PlaceBidDto) {
    return this.svc.placeBid(dto);
  }

  // /diag: cierra subastas vencidas (debug manual)
  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@Query('leagueId') leagueId: string) {
    return this.svc.closeDailyAuctions(Number(leagueId));
  }

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('cycle/start')
  startCycle(@Query('leagueId') leagueId: string) {
    return this.svc.startNewCycle(Number(leagueId));
  }

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('cycle/rotate')
  rotate(@Query('leagueId') leagueId: string) {
    return this.svc.settleAndRotate(Number(leagueId));
  }

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Post('sell-to-league')
  sellToLeague(@Body() dto: SellToLeagueDto) {
    return this.svc.sellToLeague(dto);
  }
}
