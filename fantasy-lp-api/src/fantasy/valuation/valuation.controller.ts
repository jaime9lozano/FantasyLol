// src/fantasy/valuation/valuation.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ValuationService } from './valuation.service';
import { PayClauseDto } from './dto/pay-clause.dto';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';

@Controller('fantasy/valuation')
export class ValuationController {
  constructor(private readonly svc: ValuationService) {}

  @UseGuards(MembershipGuard)
  @Post('pay-clause')
  payClause(@Body() dto: PayClauseDto, @User() user?: AuthUser) {
    if (user?.leagueId) dto.fantasyLeagueId = Number(user.leagueId);
    return this.svc.payClause(dto);
  }

  // /diag recálculo nocturno manual
  @UseGuards(MembershipGuard)
  @Post('recalc')
  recalc(@Body() body: { leagueId?: number }, @User() user?: AuthUser) {
    const leagueId = body.leagueId ?? (user?.leagueId ? Number(user.leagueId) : undefined);
    return this.svc.recalcAllValues(Number(leagueId));
  }
}
