// src/fantasy/leagues/fantasy-leagues.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { FantasyLeaguesService } from './fantasy-leagues.service';
import { CreateFantasyLeagueDto } from './dto/create-fantasy-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt.guard';
import { MembershipGuard } from '../../auth/membership.guard';
import { User } from '../../auth/user.decorator';
import type { AuthUser } from '../../auth/user.decorator';
import { Public } from '../../auth/public.decorator';

@Controller('fantasy/leagues')
export class FantasyLeaguesController {
  constructor(private readonly svc: FantasyLeaguesService) {}

  @Public()
  @Post()
  createLeague(@Body() dto: CreateFantasyLeagueDto) {
    // Por simplicidad: admin_manager_id = 1; en tu auth real toma del token/req.user
    return this.svc.createLeague(1, dto);
  }

  @Public()
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

  @UseGuards(MembershipGuard)
  @Get(':id/market/current')
  currentMarket(@Param('id') id: string, @User() user?: AuthUser) {
    // Si hay token y trae leagueId, puede usarse en el servicio para validaciones futuras
    return this.svc.getCurrentMarket(Number(id));
  }
  
  @UseGuards(MembershipGuard)
    @Get(':id/summary')
    async getLeagueSummary(
      @Param('id', ParseIntPipe) id: number,
      @Query('top') top = '10',
      @Query('teamId') teamId?: string,
      @User() user?: AuthUser,
    ) {
      const topN = Math.min(50, Math.max(1, Number(top) || 10));
      const tId = teamId ? Number(teamId) : (user?.teamId ? Number(user.teamId) : undefined);
      return this.svc.getLeagueSummary(id, topN, tId);
    }
}
