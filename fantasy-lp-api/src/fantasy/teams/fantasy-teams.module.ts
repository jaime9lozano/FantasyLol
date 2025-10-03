// src/fantasy/teams/fantasy-teams.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FantasyTeamsController } from './fantasy-teams.controller';
import { FantasyTeamsService } from './fantasy-teams.service';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasyRosterSlot } from './fantasy-roster-slot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FantasyTeam, FantasyRosterSlot])],
  controllers: [FantasyTeamsController],
  providers: [FantasyTeamsService],
  exports: [TypeOrmModule, FantasyTeamsService],
})
export class FantasyTeamsModule {}
