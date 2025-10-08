// src/fantasy/scoring/scoring.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ComputePeriodDto } from './dto/compute-period.dto';

@Controller('fantasy/scoring')
export class ScoringController {
  constructor(private readonly svc: ScoringService) {}

  // /diag para recálculo manual
  @Post('compute')
  @HttpCode(HttpStatus.CREATED)
  compute(@Body() dto: ComputePeriodDto) {
    return this.svc.computeForPeriod(dto.fantasyLeagueId, dto.periodId);
  }
  
  @Post('backfill-all')
  @HttpCode(HttpStatus.CREATED)
  backfillAll(@Body() dto: { fantasyLeagueId: number }) {
    return this.svc.backfillAllPlayerPoints(dto.fantasyLeagueId);
  }

  @Post('auto-periods')
  @HttpCode(HttpStatus.CREATED)
  autoPeriods(@Body() dto: { fantasyLeagueId: number; strategy?: string }) {
    return this.svc.autoGenerateWeeklyPeriods(dto.fantasyLeagueId, dto.strategy);
  }

  @Post('auto-periods')
  @HttpCode(HttpStatus.CREATED)
  autoGeneratePeriods(@Body() dto: { fantasyLeagueId: number; strategy?: string }) {
    return this.svc.autoGenerateWeeklyPeriods(dto.fantasyLeagueId, dto.strategy);
  }
}