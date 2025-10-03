// src/fantasy/leagues/fantasy-leagues.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FantasyLeaguesController } from './fantasy-leagues.controller';
import { FantasyLeaguesService } from './fantasy-leagues.service';
import { FantasyLeague } from './fantasy-league.entity';
import { FantasyManager } from './fantasy-manager.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FantasyLeague, FantasyManager, FantasyTeam])],
  controllers: [FantasyLeaguesController],
  providers: [FantasyLeaguesService],
  exports: [TypeOrmModule, FantasyLeaguesService],
})
export class FantasyLeaguesModule {}