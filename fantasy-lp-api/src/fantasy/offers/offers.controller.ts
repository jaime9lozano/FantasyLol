// src/fantasy/offers/offers.controller.ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';

@Controller('fantasy/offers')
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @Post()
  create(@Body() dto: CreateOfferDto) {
    return this.svc.create(dto);
  }

  @Post(':id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondOfferDto) {
    return this.svc.respond(Number(id), dto);
  }
}
