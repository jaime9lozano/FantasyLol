import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaguepediaModule } from '../leaguepedia/leaguepedia.module';
import { Team } from '../entities/team.entity';
import { Game } from '../entities/game.entity';
import { CronJobsService } from './cron.service';
import { CronController } from './cron.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    LeaguepediaModule,
    TypeOrmModule.forFeature([Team, Game]),
  ],
  providers: [CronJobsService],
  controllers: [CronController],
  exports: [CronJobsService]
})
export class CronModule {}
