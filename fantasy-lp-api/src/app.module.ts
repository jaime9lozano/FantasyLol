import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { LedgerModule } from './fantasy/ledger/ledger.module';
import { AuthModule } from './auth/auth.module';
import { FantasySchedulerModule } from './fantasy/scheduler/fantasy-scheduler.module';
import { APP_GUARD } from '@nestjs/core';
import { GlobalAuthGuard } from './auth/global-auth.guard';
import { OptionalJwtAuthGuard } from './auth/optional-jwt.guard';

@Module({
imports: [
    ConfigModule.forRoot({ isGlobal: true },),
    // Throttler opcional (se puede ajustar por ENV)
    ThrottlerModule.forRoot([{ ttl: Number(process.env.RATE_LIMIT_TTL || 60), limit: Number(process.env.RATE_LIMIT_LIMIT || 120) }]),
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
    LedgerModule,
    AuthModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Guard global estilo @Public + Optional JWT
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    OptionalJwtAuthGuard,
  ],
})
export class AppModule {}
