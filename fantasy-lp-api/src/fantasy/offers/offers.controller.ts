// src/fantasy/offers/offers.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';

@Controller('fantasy/offers')
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @UseGuards(MembershipGuard)
  @Post()
  create(@Body() dto: CreateOfferDto, @User() user?: AuthUser) {
    if (user) {
      if (user.leagueId) dto.fantasyLeagueId = Number(user.leagueId);
      if (user.teamId) dto.fromTeamId = Number(user.teamId);
    }
    return this.svc.create(dto);
  }

  @UseGuards(MembershipGuard)
  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  respond(@Param('id') id: string, @Body() dto: RespondOfferDto) {
    return this.svc.respond(Number(id), dto);
  }
}
