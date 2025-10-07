// src/fantasy/teams/fantasy-teams.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { FantasyTeamsService } from './fantasy-teams.service';
import { MoveLineupDto } from './dto/move-lineup.dto';

@Controller('fantasy/teams')
export class FantasyTeamsController {
  constructor(private readonly svc: FantasyTeamsService) {}

  @Get(':id/roster')
  roster(@Param('id') id: string) {
    return this.svc.getRoster(Number(id));
  }

  @Post(':id/lineup')
  @HttpCode(HttpStatus.OK)
  move(@Param('id') id: string, @Body() dto: MoveLineupDto) {
    return this.svc.moveLineup(Number(id), dto);
  }

  @Get('free-agents/:leagueId')
  freeAgents(@Param('leagueId') leagueId: string) {
    return this.svc.freeAgents(Number(leagueId));
  }
}
