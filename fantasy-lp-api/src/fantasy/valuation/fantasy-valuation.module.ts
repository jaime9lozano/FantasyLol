// src/fantasy/valuation/fantasy-valuation.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValuationController } from './valuation.controller';
import { ValuationService } from './valuation.service';
import { FantasyPlayerValuation } from './fantasy-player-valuation.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FantasyPlayerValuation, FantasyRosterSlot, FantasyTeam, FantasyLeague])],
  controllers: [ValuationController],
  providers: [ValuationService],
  exports: [TypeOrmModule, ValuationService],
})
export class FantasyValuationModule {}