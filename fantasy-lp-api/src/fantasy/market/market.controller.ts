// src/fantasy/market/market.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { MarketService } from './market.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { SellToLeagueDto } from './dto/sell-to-league.dto';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';

@Controller('fantasy/market')
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @UseGuards(MembershipGuard)
  @Post('listing')
  createListing(@Body() dto: CreateListingDto, @User() user?: AuthUser) {
    if (user) {
      if (user.teamId) dto.ownerTeamId = Number(user.teamId);
      if (user.leagueId) dto.fantasyLeagueId = Number(user.leagueId);
    }
    return this.svc.createListing(dto);
  }

  @UseGuards(MembershipGuard)
  @Post('bid')
  placeBid(@Body() dto: PlaceBidDto, @User() user?: AuthUser) {
    if (user?.teamId) dto.bidderTeamId = Number(user.teamId);
    return this.svc.placeBid(dto);
  }

  // /diag: cierra subastas vencidas (debug manual)
  @UseGuards(MembershipGuard)
  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@Query('leagueId') leagueId: string) {
    return this.svc.closeDailyAuctions(Number(leagueId));
  }

  @UseGuards(MembershipGuard)
  @Post('cycle/start')
  startCycle(@Query('leagueId') leagueId: string) {
    return this.svc.startNewCycle(Number(leagueId));
  }

  @UseGuards(MembershipGuard)
  @Post('cycle/rotate')
  rotate(@Query('leagueId') leagueId: string) {
    return this.svc.settleAndRotate(Number(leagueId));
  }

  @UseGuards(MembershipGuard)
  @Post('sell-to-league')
  sellToLeague(@Body() dto: SellToLeagueDto, @User() user?: AuthUser) {
    if (user) {
      if (user.teamId) dto.teamId = Number(user.teamId);
      if ((dto as any).fantasyLeagueId === undefined && user.leagueId) (dto as any).fantasyLeagueId = Number(user.leagueId);
    }
    return this.svc.sellToLeague(dto);
  }
}
