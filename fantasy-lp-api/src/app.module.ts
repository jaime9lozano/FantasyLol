import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LeaguepediaModule } from './leaguepedia/leaguepedia.module';
import { ConfigModule } from '@nestjs/config';
import { CronModule } from './cron/cron.module';
import { FantasyLeaguesModule } from './fantasy/leagues/fantasy-leagues.module';
import { FantasyTeamsModule } from './fantasy/teams/fantasy-teams.module';
import { FantasyMarketModule } from './fantasy/market/fantasy-market.module';
import { FantasyOffersModule } from './fantasy/offers/fantasy-offers.module';
import { FantasyScoringModule } from './fantasy/scoring/fantasy-scoring.module';
import { FantasyValuationModule } from './fantasy/valuation/fantasy-valuation.module';
import { FantasySchedulerModule } from './fantasy/scheduler/fantasy-scheduler.module';
import { FantasyDemoModule } from './fantasy/demo/fantasy-demo.module';

@Module({
imports: [
    ConfigModule.forRoot({ isGlobal: true },),
    DatabaseModule,
    LeaguepediaModule,
    CronModule,
    FantasyLeaguesModule,
    FantasyTeamsModule,
    FantasyMarketModule,
    FantasyOffersModule,
    FantasyScoringModule,
    FantasyValuationModule,
    FantasySchedulerModule,
    FantasyDemoModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
