// src/fantasy/market/fantasy-market.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketOrder } from './market-order.entity';
import { MarketBid } from './market-bid.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyPlayerValuation } from '../valuation/fantasy-player-valuation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MarketOrder, MarketBid, FantasyTeam, FantasyRosterSlot, FantasyLeague, FantasyPlayerValuation])],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [TypeOrmModule, MarketService],
})
export class FantasyMarketModule {}
