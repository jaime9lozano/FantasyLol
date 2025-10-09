import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { MembershipGuard } from '../../auth/membership.guard';

@Controller('fantasy/ledger')
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  @UseGuards(MembershipGuard)
  @Get()
  async list(
    @Query('leagueId') leagueId: string,
    @Query('teamId') teamId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const lid = Number(leagueId);
    const tid = teamId ? Number(teamId) : undefined;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return this.ledger.list({ leagueId: lid, teamId: tid, type, from, to, page: p, pageSize: ps });
  }
}
