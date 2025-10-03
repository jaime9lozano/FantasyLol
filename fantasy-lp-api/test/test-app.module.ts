// test/test-app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../src/database/database.module';

// ⚠️ Importamos todos los módulos Fantasy EXCEPTO el Scheduler (para evitar CRONs en test)
import { FantasyLeaguesModule } from '../src/fantasy/leagues/fantasy-leagues.module';
import { FantasyTeamsModule } from '../src/fantasy/teams/fantasy-teams.module';
import { FantasyMarketModule } from '../src/fantasy/market/fantasy-market.module';
import { FantasyOffersModule } from '../src/fantasy/offers/fantasy-offers.module';
import { FantasyScoringModule } from '../src/fantasy/scoring/fantasy-scoring.module';
import { FantasyValuationModule } from '../src/fantasy/valuation/fantasy-valuation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,

    FantasyLeaguesModule,
    FantasyTeamsModule,
    FantasyMarketModule,
    FantasyOffersModule,
    FantasyScoringModule,
    FantasyValuationModule,
  ],
})
export class TestAppModule {}