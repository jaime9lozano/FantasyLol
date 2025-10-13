// src/fantasy/scoring/scoring.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ComputePeriodDto } from './dto/compute-period.dto';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('fantasy/scoring')
export class ScoringController {
  constructor(private readonly svc: ScoringService) {}

  // /diag para recálculo manual
  @UseGuards(MembershipGuard, RolesGuard)
  @Roles('admin')
  @Post('compute')
  @HttpCode(HttpStatus.CREATED)
  compute(@Body() dto: ComputePeriodDto, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.computeForPeriod(Number(leagueId), dto.periodId);
  }
  
  @UseGuards(MembershipGuard, RolesGuard)
  @Roles('admin')
  @Post('backfill-all')
  @HttpCode(HttpStatus.CREATED)
  backfillAll(@Body() dto: { fantasyLeagueId?: number }, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.backfillAllPlayerPoints(Number(leagueId));
  }

  @UseGuards(MembershipGuard, RolesGuard)
  @Roles('admin')
  @Post('auto-periods')
  @HttpCode(HttpStatus.CREATED)
  autoPeriods(@Body() dto: { fantasyLeagueId?: number; strategy?: string }, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.autoGenerateWeeklyPeriods(Number(leagueId), dto.strategy);
  }

  // Lecturas para front
  @UseGuards(MembershipGuard)
  @Get('periods')
  periods(@Query('leagueId') leagueId?: string, @User() user?: AuthUser) {
    const id = leagueId ? Number(leagueId) : Number(user?.leagueId);
    return this.svc.listPeriods(id);
  }

  @UseGuards(MembershipGuard)
  @Get('periods/:periodId/teams')
  periodTeams(@Param('periodId') periodId: string, @Query('leagueId') leagueId?: string, @User() user?: AuthUser) {
    const id = leagueId ? Number(leagueId) : Number(user?.leagueId);
    return this.svc.listTeamPointsForPeriod(id, Number(periodId));
  }

  // ---- Player stats for UI ----
  @UseGuards(MembershipGuard)
  @Get('players/:playerId/summary')
  playerSummary(
    @Param('playerId') playerId: string,
    @Query('leagueId') leagueId?: string,
    @User() user?: AuthUser,
  ) {
    const id = leagueId ? Number(leagueId) : Number(user?.leagueId);
    return this.svc.getPlayerSummary(id, Number(playerId));
  }

  @UseGuards(MembershipGuard)
  @Get('players/:playerId/periods')
  playerPeriods(
    @Param('playerId') playerId: string,
    @Query('leagueId') leagueId?: string,
    @User() user?: AuthUser,
  ) {
    const id = leagueId ? Number(leagueId) : Number(user?.leagueId);
    return this.svc.getPlayerPointsByPeriod(id, Number(playerId));
  }

  @UseGuards(MembershipGuard)
  @Get('players/:playerId/periods/:periodId/breakdown')
  playerBreakdown(
    @Param('playerId') playerId: string,
    @Param('periodId') periodId: string,
    @Query('leagueId') leagueId?: string,
    @User() user?: AuthUser,
  ) {
    const id = leagueId ? Number(leagueId) : Number(user?.leagueId);
    return this.svc.getPlayerBreakdownForPeriod(id, Number(playerId), Number(periodId));
  }
}