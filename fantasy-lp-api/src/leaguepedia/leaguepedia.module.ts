import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { League } from '../entities/league.entity';
import { Tournament } from '../entities/tournament.entity';
import { Role } from '../entities/role.entity';
import { Team } from '../entities/team.entity';
import { Player } from '../entities/player.entity';
import { Game } from '../entities/game.entity';
import { PlayerGameStats } from '../entities/player-game-stats.entity';
import { TeamPlayerMembership } from '../entities/team-player-membership.entity';
import { LeaguepediaClient } from './leaguepedia.client';
import { LeaguepediaController } from './leaguepedia.controller';
import { LeaguepediaStatsService } from './leaguepedia.stats.service';
import { LeaguepediaTeamsService } from './leaguepedia.teams.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      League,
      Tournament,
      Role,
      Team,
      Player,
      Game,
      PlayerGameStats,
      TeamPlayerMembership,
    ]),
  ],
  providers: [LeaguepediaClient, LeaguepediaTeamsService, LeaguepediaStatsService],
  controllers: [LeaguepediaController],
  exports: [LeaguepediaClient, LeaguepediaTeamsService, LeaguepediaStatsService],
})
export class LeaguepediaModule {}
