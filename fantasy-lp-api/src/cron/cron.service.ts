import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { LeaguepediaTeamsService } from '../leaguepedia/leaguepedia.teams.service';
import { LeaguepediaStatsService } from '../leaguepedia/leaguepedia.stats.service';
import { Team } from '../entities/team.entity';
import { Game } from '../entities/game.entity';

import { CronLock, daysAgoUtc, hoursAgoUtc, readCsvEnv } from './cron.utils';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);
  private readonly lock: CronLock;

  private readonly targetLeagues = readCsvEnv('LEAGUEPEDIA_TARGET_LEAGUES');
  private readonly year = Number(process.env.CRON_LEAGUE_YEAR ?? '2025');
  private readonly officialOnly = (process.env.CRON_OFFICIAL_ONLY ?? '1') === '1';

  private readonly gamesWindowH = Number(process.env.CRON_GAMES_WINDOW_HOURS ?? '72');
  private readonly statsWindowH = Number(process.env.CRON_STATS_WINDOW_HOURS ?? '72');
  private readonly rosterSinceDays = Number(process.env.CRON_ROSTER_SINCE_DAYS ?? '90');
  private readonly rosterMinGames = Number(process.env.CRON_ROSTER_MIN_GAMES ?? '2');

  constructor(
    private readonly ds: DataSource,
    private readonly teamsSvc: LeaguepediaTeamsService,
    private readonly statsSvc: LeaguepediaStatsService,
    @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
    @InjectRepository(Game) private readonly gameRepo: Repository<Game>,
  ) {
    this.lock = new CronLock(this.ds);
  }

  // -------------------------------------------------------------------------
  // 1) Semilla/refresh de ligas (semanal, domingo 04:05 UTC)
  // -------------------------------------------------------------------------
  @Cron('5 4 * * 0')
  async leaguesWeekly() {
    const LOCK_KEY = 10_001;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[leaguesWeekly] lock busy, skipping');
      return;
    }
    this.logger.log('[leaguesWeekly] start');
    try {
      // Todas las ligas oficiales del año configurado
      const rows = await this.statsSvc.fetchDistinctLeaguesFromTournaments(this.year, this.officialOnly);
      const upserts = await this.statsSvc.upsertLeaguesFromTournaments(rows);
      this.logger.log(`[leaguesWeekly] leagues upserts=${upserts}`);
    } catch (e) {
      this.logger.error('[leaguesWeekly] error', e as any);
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[leaguesWeekly] done');
    }
  }

  // -------------------------------------------------------------------------
  // 2) Tournaments diarios (03:05 UTC)
  //    Depende de leagues pero usa Tournaments como fuente directa.
  // -------------------------------------------------------------------------
  @Cron('5 3 * * *')
  async tournamentsDaily() {
    const LOCK_KEY = 10_002;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[tournamentsDaily] lock busy, skipping');
      return;
    }
    this.logger.log('[tournamentsDaily] start');
    try {
      for (const lg of this.targetLeagues) {
        try {
          const rows = await this.statsSvc.fetchTournamentsByNameLike(lg, this.year, this.officialOnly);
          const upserts = await this.statsSvc.upsertTournaments(rows);
          this.logger.log(`[tournamentsDaily] ${lg}: upserts=${upserts}`);
          await new Promise(r => setTimeout(r, 200)); // rate limit amigable
        } catch (e) {
          this.logger.error(`[tournamentsDaily] ${lg} error`, e as any);
        }
      }
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[tournamentsDaily] done');
    }
  }

  // -------------------------------------------------------------------------
  // 3) Teams + Players (diario 03:20 UTC)
  //    Descubre equipos y jugadores de la ventana anual → evita NULLs en stats.
  // -------------------------------------------------------------------------
  @Cron('20 3 * * *')
  async teamsAndPlayersDaily() {
    const LOCK_KEY = 10_003;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[teamsAndPlayersDaily] lock busy, skipping');
      return;
    }
    this.logger.log('[teamsAndPlayersDaily] start');
    try {
      const from = `${this.year}-01-01 00:00:00`;
      const to   = `${this.year}-12-31 23:59:59`;

      for (const lg of this.targetLeagues) {
        try {
          // Teams primero
          const tRes = await this.teamsSvc.upsertTeamsByLeagueNameLike(lg, from, to);
          this.logger.log(`[teamsAndPlayersDaily] ${lg} teams: ${JSON.stringify(tRes)}`);

          // Players después (usa ScoreboardPlayers DISTINCT + Players + imageinfo/pageimages)
          const pRes = await this.statsSvc.upsertPlayersByLeagueNameLike(lg, from, to, this.officialOnly);
          this.logger.log(`[teamsAndPlayersDaily] ${lg} players: ${JSON.stringify(pRes)}`);

          await new Promise(r => setTimeout(r, 250));
        } catch (e) {
          this.logger.error(`[teamsAndPlayersDaily] ${lg} error`, e as any);
        }
      }
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[teamsAndPlayersDaily] done');
    }
  }

  // -------------------------------------------------------------------------
  // 4) Games (cada hora, minuto 10) – ventana móvil
  //    Precondición: tournaments seeded ↔ evita NULL en tournament_id.
  // -------------------------------------------------------------------------
  @Cron('10 * * * *')
  async gamesHourly() {
    const LOCK_KEY = 10_004;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[gamesHourly] lock busy, skipping');
      return;
    }
    this.logger.log('[gamesHourly] start');
    try {
      const to = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const from = hoursAgoUtc(this.gamesWindowH);

      for (const lg of this.targetLeagues) {
        try {
          const rows = await this.statsSvc.fetchGamesByLeagueNameLike(lg, from, to);
          const upserts = await this.statsSvc.upsertGames(rows);
          this.logger.log(`[gamesHourly] ${lg}: ${rows.length} rows, upserts=${upserts}`);
          await new Promise(r => setTimeout(r, 150));
        } catch (e) {
          this.logger.error(`[gamesHourly] ${lg} error`, e as any);
        }
      }

      // Normalización opcional: asignar team*_id/winner_team_id por nombre (si existen)
      await this.normalizeRecentGamesTeams(this.gamesWindowH);
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[gamesHourly] done');
    }
  }

  // -------------------------------------------------------------------------
  // 5) Player stats (cada hora, minuto 25) – ventana móvil, tras gamesHourly
  //    Precondición: players seeded (aunque el upsert también crea players si faltan).
  // -------------------------------------------------------------------------
  @Cron('25 * * * *')
  async statsHourly() {
    const LOCK_KEY = 10_005;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[statsHourly] lock busy, skipping');
      return;
    }
    this.logger.log('[statsHourly] start');
    try {
      const to = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const from = hoursAgoUtc(this.statsWindowH);

      for (const lg of this.targetLeagues) {
        try {
          const rows = await this.statsSvc.fetchPlayerStatsByLeagueNameLike(lg, from, to);
          const upserts = await this.statsSvc.upsertPlayerStats(rows);
          this.logger.log(`[statsHourly] ${lg}: ${rows.length} rows, upserts=${upserts}`);
          await new Promise(r => setTimeout(r, 150));
        } catch (e) {
          this.logger.error(`[statsHourly] ${lg} error`, e as any);
        }
      }
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[statsHourly] done');
    }
  }

  // -------------------------------------------------------------------------
  // 6) Roster (cada 6h, minuto 40)
  //    Precondición: teams y players ya existen; usa ventana “sinceDays”.
  // -------------------------------------------------------------------------
  @Cron('40 */6 * * *')
  async rosterSixHourly() {
    const LOCK_KEY = 10_006;
    if (!(await this.lock.tryLock(LOCK_KEY))) {
      this.logger.warn('[rosterSixHourly] lock busy, skipping');
      return;
    }
    this.logger.log('[rosterSixHourly] start');
    try {
      const sinceUtc = daysAgoUtc(this.rosterSinceDays);

      // Recorremos todos los equipos conocidos (podrías filtrar por region/league si lo guardas)
      const teams = await this.teamRepo
        .createQueryBuilder('t')
        .orderBy('t.updated_at', 'DESC')
        .limit(3000) // por si acaso
        .getMany();

      for (const t of teams) {
        try {
          const res = await this.statsSvc.recomputeCurrentRosterForTeam(t.teamName, sinceUtc, this.rosterMinGames);
          this.logger.log(`[rosterSixHourly] ${t.teamName}: ${JSON.stringify(res)}`);
          await new Promise(r => setTimeout(r, 120));
        } catch (e) {
          this.logger.warn(`[rosterSixHourly] error on ${t.teamName}`, e as any);
        }
      }
    } finally {
      await this.lock.unlock(LOCK_KEY);
      this.logger.log('[rosterSixHourly] done');
    }
  }

  // -------------------------------------------------------------------------
  // Utilidad: normaliza teams en juegos recientes (por nombre a IDs)
  // -------------------------------------------------------------------------
  private async normalizeRecentGamesTeams(windowHours: number) {
    const since = hoursAgoUtc(windowHours);
    // Selecciona juegos recientes sin team_ids resueltos
    const rows: Array<{ id: number; team1_text: string | null; team2_text: string | null; win_team_text: string | null }> =
      await this.gameRepo.query(
        `SELECT id, team1_text, team2_text, win_team_text
         FROM game
         WHERE datetime_utc >= $1
           AND (team1_id IS NULL OR team2_id IS NULL OR winner_team_id IS NULL)
         ORDER BY datetime_utc DESC
         LIMIT 5000`,
        [since],
      );

    if (!rows.length) return;

    // Mapa de nombre LP → team.id (por team_name y por leaguepedia_team_page)
    const teams = await this.teamRepo.find();
    const byName = new Map<string, number>();
    const byPage = new Map<string, number>();
    for (const t of teams) {
      if (t.teamName) byName.set(t.teamName.toLowerCase(), t.id);
      if (t.leaguepediaTeamPage) byPage.set(t.leaguepediaTeamPage.toLowerCase(), t.id);
    }

    let updates = 0;
    for (const g of rows) {
      const t1 = g.team1_text?.toLowerCase() ?? '';
      const t2 = g.team2_text?.toLowerCase() ?? '';
      const w  = g.win_team_text?.toLowerCase() ?? '';

      const team1Id = byName.get(t1) ?? byPage.get(t1) ?? null;
      const team2Id = byName.get(t2) ?? byPage.get(t2) ?? null;
      const winnerId = byName.get(w) ?? byPage.get(w) ?? null;

      if (team1Id || team2Id || winnerId) {
        await this.gameRepo.query(
          `UPDATE game
           SET team1_id = COALESCE($2, team1_id),
               team2_id = COALESCE($3, team2_id),
               winner_team_id = COALESCE($4, winner_team_id)
           WHERE id = $1`,
          [g.id, team1Id, team2Id, winnerId],
        );
        updates++;
      }
    }
    this.logger.log(`[gamesHourly] normalized team ids updates=${updates}`);
  }
}