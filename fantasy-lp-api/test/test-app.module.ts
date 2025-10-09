// test/test-app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FantasyLeaguesModule } from '../src/fantasy/leagues/fantasy-leagues.module';
import { FantasyTeamsModule } from '../src/fantasy/teams/fantasy-teams.module';
import { FantasyMarketModule } from '../src/fantasy/market/fantasy-market.module';
import { FantasyOffersModule } from '../src/fantasy/offers/fantasy-offers.module';
import { FantasyScoringModule } from '../src/fantasy/scoring/fantasy-scoring.module';
import { FantasyValuationModule } from '../src/fantasy/valuation/fantasy-valuation.module';
import { LedgerModule } from '../src/fantasy/ledger/ledger.module';
import { DatabaseTestModule } from 'src/database/database.test.module';
import { AuthModule } from 'src/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { GlobalAuthGuard } from 'src/auth/global-auth.guard';
import { OptionalJwtAuthGuard } from 'src/auth/optional-jwt.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseTestModule,
  AuthModule,
    FantasyLeaguesModule,
    FantasyTeamsModule,
    FantasyMarketModule,
    FantasyOffersModule,
    FantasyScoringModule,
    FantasyValuationModule,
    LedgerModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    OptionalJwtAuthGuard,
  ],
})
export class TestAppModule {}