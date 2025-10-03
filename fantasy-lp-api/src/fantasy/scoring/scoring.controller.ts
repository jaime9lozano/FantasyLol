// src/fantasy/scoring/scoring.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ComputePeriodDto } from './dto/compute-period.dto';

@Controller('fantasy/scoring')
export class ScoringController {
  constructor(private readonly svc: ScoringService) {}

  // /diag para recálculo manual
  @Post('compute')
  compute(@Body() dto: ComputePeriodDto) {
    return this.svc.computeForPeriod(dto.fantasyLeagueId, dto.periodId);
  }
}