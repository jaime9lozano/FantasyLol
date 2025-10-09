// src/fantasy/scoring/scoring.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ComputePeriodDto } from './dto/compute-period.dto';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';

@Controller('fantasy/scoring')
export class ScoringController {
  constructor(private readonly svc: ScoringService) {}

  // /diag para recálculo manual
  @UseGuards(MembershipGuard)
  @Post('compute')
  @HttpCode(HttpStatus.CREATED)
  compute(@Body() dto: ComputePeriodDto, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.computeForPeriod(Number(leagueId), dto.periodId);
  }
  
  @UseGuards(MembershipGuard)
  @Post('backfill-all')
  @HttpCode(HttpStatus.CREATED)
  backfillAll(@Body() dto: { fantasyLeagueId?: number }, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.backfillAllPlayerPoints(Number(leagueId));
  }

  @UseGuards(MembershipGuard)
  @Post('auto-periods')
  @HttpCode(HttpStatus.CREATED)
  autoPeriods(@Body() dto: { fantasyLeagueId?: number; strategy?: string }, @User() user?: AuthUser) {
    const leagueId = dto.fantasyLeagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.autoGenerateWeeklyPeriods(Number(leagueId), dto.strategy);
  }
}