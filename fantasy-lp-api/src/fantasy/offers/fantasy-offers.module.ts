// src/fantasy/offers/fantasy-offers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { TransferOffer } from './transfer-offer.entity';
import { TransferTransaction } from './transfer-transaction.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransferOffer, TransferTransaction, FantasyRosterSlot, FantasyTeam])],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [TypeOrmModule, OffersService],
})
export class FantasyOffersModule {}