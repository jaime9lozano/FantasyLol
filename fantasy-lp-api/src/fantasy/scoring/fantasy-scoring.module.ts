// src/fantasy/scoring/fantasy-scoring.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';
import { ScoringRewardsService } from './scoring-rewards.service';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyScoringPeriod } from './fantasy-scoring-period.entity';
import { FantasyPlayerPoints } from './fantasy-player-points.entity';
import { PlayerGameStats } from 'src/entities/player-game-stats.entity';
import { FantasyTeamPoints } from './fantasy-team-points.entity';


@Module({
  imports: [TypeOrmModule.forFeature([FantasyLeague, FantasyScoringPeriod, FantasyPlayerPoints, FantasyTeamPoints, PlayerGameStats])],
  controllers: [ScoringController],
  providers: [ScoringService, ScoringRewardsService],
  exports: [TypeOrmModule, ScoringService, ScoringRewardsService],
})
export class FantasyScoringModule {}