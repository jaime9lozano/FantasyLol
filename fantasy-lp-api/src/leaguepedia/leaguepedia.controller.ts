import { Controller, Get, Query } from '@nestjs/common';
import { LeaguepediaTeamsService } from './leaguepedia.teams.service';
import { LeaguepediaStatsService } from './leaguepedia.stats.service';

@Controller('diag/leaguepedia')
export class LeaguepediaController {
  constructor(
    private readonly teamsSvc: LeaguepediaTeamsService,
    private readonly statsSvc: LeaguepediaStatsService,
  ) {}

  // --- Tournaments ---
  @Get('tournaments')
  async tournaments(
    @Query('nameLike') nameLike: string,
    @Query('year') year?: string,
    @Query('official') official?: '0' | '1',
    @Query('primary') primary?: '0' | '1',          
    @Query('ingest') ingest?: '0' | '1',
  ) {
    const officialOnly = official != null ? official === '1' : undefined;
    const primaryOnly  = primary  != null ? primary  === '1' : undefined; 
    const y = year ? Number(year) : undefined;

    const rows = await this.statsSvc.fetchTournamentsByNameLike(
      nameLike,
      y,
      officialOnly,
      primaryOnly,                                    
    );

    if (ingest === '1') {
      const n = await this.statsSvc.upsertTournaments(rows);
      return { action: 'upsertTournaments', nameLike, year: y, officialOnly, primaryOnly, upserts: n };
    }
    return { nameLike, year: y, officialOnly, primaryOnly, rows };
  }

  // --- Teams (descubrir por liga) ---
  @Get('teams')
  async teams(
    @Query('leagueLike') leagueLike: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ingest') ingest?: '0' | '1',
  ) {
    if (ingest === '1') {
      const res = await this.teamsSvc.upsertTeamsByLeagueNameLike(leagueLike, from, to);
      return { leagueLike, from, to, ...res };
    }
    const names = await this.teamsSvc.listTeamsPlayedInLeague(leagueLike, from, to);
    return { leagueLike, from, to, namesCount: names.length, names };
  }

  // --- Games ---
  @Get('games')
  async games(
    @Query('leagueLike') leagueLike: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ingest') ingest?: '0' | '1',
  ) {
    if (!from || !to) {
      return {
        error: 'Missing from/to',
        hint: '/diag/leaguepedia/games?leagueLike=LEC&from=YYYY-MM-DD%20HH:mm:SS&to=YYYY-MM-DD%20HH:mm:SS',
      };
    }

    const rows = await this.statsSvc.fetchGamesByLeagueNameLike(leagueLike, from, to);
    if (ingest === '1') {
      const n = await this.statsSvc.upsertGames(rows);
      return { leagueLike, from, to, upserts: n };
    }
    return { leagueLike, from, to, rowsCount: rows.length, sample: rows.slice(0, 5) };
  }

  // --- Player Stats ---
  @Get('playerstats')
  async playerStats(
    @Query('leagueLike') leagueLike: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ingest') ingest?: '0' | '1',
  ) {
    if (!from || !to) {
      return {
        error: 'Missing from/to',
        hint: '/diag/leaguepedia/playerstats?leagueLike=LEC&from=YYYY-MM-DD%20HH:mm:SS&to=YYYY-MM-DD%20HH:mm:SS',
      };
    }

    const rows = await this.statsSvc.fetchPlayerStatsByLeagueNameLike(leagueLike, from, to);
    if (ingest === '1') {
      const n = await this.statsSvc.upsertPlayerStats(rows);
      return { leagueLike, from, to, upserts: n };
    }
    return { leagueLike, from, to, rowsCount: rows.length, sample: rows.slice(0, 5) };
  }

  // --- Roster derivado (ventana) ---
  @Get('roster')
  async roster(
    @Query('team') team: string,
    @Query('sinceDays') sinceDays: string = '90',
    @Query('minGames') minGames: string = '2',
    @Query('ingest') ingest?: '0' | '1',
  ) {
    if (!team) {
      return { error: 'Missing team', hint: '/diag/leaguepedia/roster?team=G2%20Esports&sinceDays=90' };
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - Number(sinceDays));
    const sinceUtc = since.toISOString().slice(0, 19).replace('T', ' ');

    if (ingest === '1') {
      const res = await this.statsSvc.recomputeCurrentRosterForTeam(team, sinceUtc, Number(minGames));
      return { team, sinceUtc, minGames: Number(minGames), ...res };
    }

    const rows = await this.statsSvc.fetchRosterWindow(team, sinceUtc);
    return { team, sinceUtc, rowsCount: rows.length, sample: rows.slice(0, 10) };
  }

  // ... imports y clase existentes

  // --- Players (descubrir todos los jugadores que jugaron en la liga) ---
  @Get('players')
  async players(
    @Query('leagueLike') leagueLike: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('official') official?: '0' | '1',
    @Query('ingest') ingest?: '0' | '1',
  ) {
    if (!from || !to) {
      return {
        error: 'Missing from/to',
        hint: '/diag/leaguepedia/players?leagueLike=LEC&from=YYYY-MM-DD%20HH:mm:SS&to=YYYY-MM-DD%20HH:mm:SS',
      };
    }
    const officialOnly = official != null ? official === '1' : undefined;

    if (ingest === '1') {
      const res = await this.statsSvc.upsertPlayersByLeagueNameLike(leagueLike, from, to, officialOnly);
      return { leagueLike, from, to, officialOnly, ...res };
    }
    const playerPages = await this.statsSvc.fetchDistinctPlayerPagesByLeagueNameLike(leagueLike, from, to, officialOnly);
    return { leagueLike, from, to, officialOnly, count: playerPages.length, sample: playerPages.slice(0, 20) };
  }

  // --- Leagues: por filtro (ej. LEC 2025) ---
  @Get('leagues')
  async leagues(
    @Query('year') year?: string,
    @Query('official') official?: '0' | '1',
    @Query('nameLike') nameLike?: string, // p.ej. "%LEC%"
    @Query('ingest') ingest?: '0' | '1',
    @Query('overrideCode') overrideCode?: string, // p.ej. 'LEC'
    @Query('overrideRegion') overrideRegion?: string, // p.ej. 'EMEA'
  ) {
    const officialOnly = official != null ? official === '1' : undefined;
    const y = year ? Number(year) : undefined;

    const rows = await this.statsSvc.fetchDistinctLeaguesFromTournaments(y, officialOnly, nameLike);
    if (ingest === '1') {
      const upserts = await this.statsSvc.upsertLeaguesFromTournaments(rows, overrideCode, overrideRegion);
      return { year: y, officialOnly, nameLike, upserts, rows: rows.slice(0, 10) };
    }
    return { year: y, officialOnly, nameLike, rowsCount: rows.length, sample: rows.slice(0, 10) };
  }

  // --- Leagues: TODAS las oficiales de un año ---
  @Get('leagues/all')
  async leaguesAll(
    @Query('year') year: string,
    @Query('official') official: '0' | '1' = '1',
    @Query('ingest') ingest?: '0' | '1',
  ) {
    const y = Number(year);
    const officialOnly = official === '1';
    const rows = await this.statsSvc.fetchDistinctLeaguesFromTournaments(y, officialOnly);
    if (ingest === '1') {
      const upserts = await this.statsSvc.upsertLeaguesFromTournaments(rows);
      return { year: y, officialOnly, upserts, sample: rows.slice(0, 10) };
    }
    return { year: y, officialOnly, rowsCount: rows.length, sample: rows.slice(0, 10) };
  }
}
