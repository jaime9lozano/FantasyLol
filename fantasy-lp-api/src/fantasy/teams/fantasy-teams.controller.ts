// src/fantasy/teams/fantasy-teams.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FantasyTeamsService } from './fantasy-teams.service';
import { MoveLineupDto } from './dto/move-lineup.dto';
import { DataSource } from 'typeorm';
import { T } from '../../database/schema.util';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt.guard';
import { MembershipGuard } from '../../auth/membership.guard';

@Controller('fantasy/teams')
export class FantasyTeamsController {
  constructor(private readonly svc: FantasyTeamsService, private ds: DataSource) {}

  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Get(':id/roster')
  roster(@Param('id') id: string) {
    return this.svc.getRoster(Number(id));
  }

  // Roster compacto pensado para la pantalla inicial (datos mínimos y ordenado)
  @UseGuards(OptionalJwtAuthGuard, MembershipGuard)
  @Get(':id/roster/compact')
  compactRoster(@Param('id') id: string) {
    return this.svc.getCompactRoster(Number(id));
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

  @Get(':teamId/player/:playerId/stats')
  async playerStats(
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Query('leagueId') leagueId: string,
  ) {
    const rows = await this.ds.query(
      `SELECT sp.id AS period_id, sp.name, COALESCE(SUM(fpp.points::float),0) AS points
       FROM ${T('fantasy_scoring_period')} sp
       LEFT JOIN ${T('fantasy_player_points')} fpp
         ON fpp.fantasy_league_id = sp.fantasy_league_id
        AND fpp.player_id = $2
        AND EXISTS (
            SELECT 1 FROM public.game g
            WHERE g.id = fpp.game_id
              AND g.datetime_utc >= sp.starts_at
              AND g.datetime_utc <  sp.ends_at
        )
       WHERE sp.fantasy_league_id = $1
       GROUP BY sp.id, sp.name
       ORDER BY sp.id ASC`,
      [Number(leagueId), Number(playerId)],
    );
    const [v] = await this.ds.query(
      `SELECT current_value::bigint AS v FROM ${T('fantasy_player_valuation')} WHERE fantasy_league_id=$1 AND player_id=$2`,
      [Number(leagueId), Number(playerId)],
    );
    return { periods: rows, currentValue: v?.v ?? 0 };
  }
}
