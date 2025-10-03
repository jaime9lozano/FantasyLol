// src/fantasy/scheduler/fantasy-scheduler.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FantasySchedulerService } from './scheduler.service';
import { FantasyMarketModule } from '../market/fantasy-market.module';
import { FantasyValuationModule } from '../valuation/fantasy-valuation.module';
import { FantasyLeague } from '../leagues/fantasy-league.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([FantasyLeague]),
    FantasyMarketModule,
    FantasyValuationModule,
  ],
  providers: [FantasySchedulerService],
})
export class FantasySchedulerModule {}
