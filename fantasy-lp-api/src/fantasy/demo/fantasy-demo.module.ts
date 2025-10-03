// src/fantasy/demo/fantasy-demo.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FantasyDemoController } from './fantasy-demo.controller';
import { FantasyDemoService } from './fantasy-demo.service';
import { FantasyLeaguesModule } from '../leagues/fantasy-leagues.module';
import { FantasyTeamsModule } from '../teams/fantasy-teams.module';
import { FantasyMarketModule } from '../market/fantasy-market.module';
import { FantasyManager } from '../leagues/fantasy-manager.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyPlayerValuation } from '../valuation/fantasy-player-valuation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FantasyManager, FantasyLeague, FantasyTeam, FantasyRosterSlot, FantasyPlayerValuation
    ]),
    FantasyLeaguesModule,
    FantasyTeamsModule,
    FantasyMarketModule,
  ],
  controllers: [FantasyDemoController],
  providers: [FantasyDemoService],
})
export class FantasyDemoModule {}