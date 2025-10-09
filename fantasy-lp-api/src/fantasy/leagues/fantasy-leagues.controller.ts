// src/fantasy/leagues/fantasy-leagues.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, ParseIntPipe } from '@nestjs/common';
import { FantasyLeaguesService } from './fantasy-leagues.service';
import { CreateFantasyLeagueDto } from './dto/create-fantasy-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';

@Controller('fantasy/leagues')
export class FantasyLeaguesController {
  constructor(private readonly svc: FantasyLeaguesService) {}

  @Post()
  createLeague(@Body() dto: CreateFantasyLeagueDto) {
    // Por simplicidad: admin_manager_id = 1; en tu auth real toma del token/req.user
    return this.svc.createLeague(1, dto);
  }

  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  join(@Body() dto: JoinLeagueDto) {
    return this.svc.joinLeague(dto);
  }

  @Get(':id/ranking')
  ranking(@Param('id') id: string) {
    return this.svc.ranking(Number(id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeagueDto) {
    return this.svc.updateLeague(Number(id), dto);
  }

  @Patch(':id/economic-config')
  updateEconomic(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateEconomicConfig(Number(id), body);
  }

  @Get(':id/market/current')
  currentMarket(@Param('id') id: string) {
    return this.svc.getCurrentMarket(Number(id));
  }
  
    @Get(':id/summary')
    async getLeagueSummary(
      @Param('id', ParseIntPipe) id: number,
      @Query('top') top = '10',
      @Query('teamId') teamId?: string,
    ) {
      const topN = Math.min(50, Math.max(1, Number(top) || 10));
      const tId = teamId ? Number(teamId) : undefined;
      return this.svc.getLeagueSummary(id, topN, tId);
    }
}
