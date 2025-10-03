// src/fantasy/valuation/valuation.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ValuationService } from './valuation.service';
import { PayClauseDto } from './dto/pay-clause.dto';

@Controller('fantasy/valuation')
export class ValuationController {
  constructor(private readonly svc: ValuationService) {}

  @Post('pay-clause')
  payClause(@Body() dto: PayClauseDto) {
    return this.svc.payClause(dto);
  }

  // /diag recálculo nocturno manual
  @Post('recalc')
  recalc(@Body() body: { leagueId: number }) {
    return this.svc.recalcAllValues(body.leagueId);
  }
}
