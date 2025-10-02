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
          const rows = await this.statsSvc.fetchTournamentsByNameLike(lg, this.year, this.officialOnly, true);
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
  this.logger.log(
    `[teamsAndPlayersDaily] start (year=${this.year}, leagues=${this.targetLeagues.join(',')})`,
  );

  // Helpers
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const sanitize = (s: string) =>
    (s ?? '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // ZWSP/BOM/NBSP
      .replace(/[^\x20-\x7E]/g, '')               // no-imprimibles
      .trim();
  const baseCode = (s: string) => sanitize(s).replace(/[0-9]/g, '').toUpperCase();

  // 🎯 Prioridad por liga (candidatos "fiables" primero)
  // - LCK: LCK21 ➜ LoL Champions Korea ➜ League of Legends Champions Korea ➜ LCK
  // - LPL: Tencent LoL Pro League ➜ LoL Pro League ➜ LPL2020 ➜ LPL
  // - LEC: LEC ➜ LoL EMEA Championship ➜ League of Legends EMEA Championship
  const prioritizedCandidates = (raw: string): string[] => {
    const base = baseCode(raw);
    const rawSan = sanitize(raw);
    let list: string[] = [];

    if (base === 'LCK') {
      list = ['LCK21', 'LoL Champions Korea', 'League of Legends Champions Korea', 'LCK'];
    } else if (base === 'LPL') {
      list = ['Tencent LoL Pro League', 'LoL Pro League', 'LPL2020', 'LPL'];
    } else if (base === 'LEC') {
      list = ['LEC', 'LoL EMEA Championship', 'League of Legends EMEA Championship'];
    } else {
      // fallback genérico
      list = [base];
    }
    if (rawSan && !list.includes(rawSan)) list.push(rawSan);
    // dedupe
    return Array.from(new Set(list.filter(Boolean)));
  };

  // (Opcional) barajar ligas por env para evitar sesgos de orden
  const leagues = [...this.targetLeagues];
  if (process.env.CRON_SHUFFLE_LEAGUES === '1') {
    leagues.sort(() => Math.random() - 0.5);
  }

  try {
    const from = `${this.year}-01-01 00:00:00`;
    const to   = `${this.year}-12-31 23:59:59`;

    for (const [i, lgRaw] of leagues.entries()) {
      // Cooldown entre ligas: 2–3s al iniciar + si no es la primera liga, 6–9s extra
      await sleep(2000 + Math.floor(Math.random() * 1000));
      if (i > 0) await sleep(6000 + Math.floor(Math.random() * 3000));

      const candidates = prioritizedCandidates(lgRaw);
      const lgBase = baseCode(lgRaw);
      this.logger.debug?.(
        `[teamsAndPlayersDaily] ${lgRaw} candidates => ${JSON.stringify(candidates)}`,
      );

      // ---------- PREFLIGHT (teams) con backoff y cooldown fuerte si 0 ----------
      let selectedLike: string | null = null;
      const preflightBackoffs = [1500, 2500, 4000]; // ligeramente más altos

      candidateLoop:
      for (const like of candidates) {
        for (let attempt = 0; attempt < preflightBackoffs.length; attempt++) {
          try {
            const names = await this.teamsSvc.listTeamsPlayedInLeague(like, from, to);
            const count = names?.length ?? 0;
            const sample = count ? names.slice(0, 5).join(' | ') : '';
            this.logger.log(
              `[teamsAndPlayersDaily] ${lgBase} preflight teams [${like}] ` +
              `(try ${attempt + 1}/${preflightBackoffs.length}): count=${count}` +
              (sample ? `, sample=${sample}` : ''),
            );
            if (count > 0) {
              selectedLike = like;
              // ✅ mini-cooldown para no golpear el mismo índice de caché inmediatamente
              await sleep(2000 + Math.floor(Math.random() * 1500));
              break candidateLoop;
            }
          } catch (e) {
            this.logger.warn(
              `[teamsAndPlayersDaily] ${lgBase} preflight teams error [${like}] ` +
              `(try ${attempt + 1}): ${String(e)}`,
            );
          }
          await sleep(preflightBackoffs[attempt]);
        }
      }

      // Plan B (torneos) solo si NADA funcionó
      if (!selectedLike) {
        this.logger.warn(
          `[teamsAndPlayersDaily] ${lgBase} preflight teams found no names. Trying tournaments preflight...`,
        );
        for (const like of candidates) {
          const attempts: Array<{ year?: number; primary?: boolean; label: string }> = [
            { year: this.year,     primary: true,      label: 'y=year, primary' },
            { year: undefined,     primary: true,      label: 'y=any,  primary' },
            { year: this.year,     primary: undefined, label: 'y=year, anyLvl' },
            { year: undefined,     primary: undefined, label: 'y=any,  anyLvl' },
          ];
          for (const a of attempts) {
            try {
              const rows = await this.statsSvc.fetchTournamentsByNameLike(
                like, a.year, this.officialOnly ?? true, a.primary,
              );
              const count = rows?.length ?? 0;
              const sample = count
                ? rows.slice(0, 3).map((r: any) => r.Name).filter(Boolean).join(' | ')
                : '';
              this.logger.log(
                `[teamsAndPlayersDaily] ${lgBase} preflight tournaments [${like}] (${a.label}): ` +
                `count=${count}${sample ? `, sample=${sample}` : ''}`,
              );
              if (count > 0) {
                selectedLike = like;
                // cooldown mayor tras preflight de torneos antes de volver a SP/Teams
                await sleep(3000 + Math.floor(Math.random() * 2000));
                break;
              }
            } catch (e) {
              this.logger.warn(
                `[teamsAndPlayersDaily] ${lgBase} preflight tournaments error [${like}] ` +
                `(${a.label}): ${String(e)}`,
              );
            }
            await sleep(800 + Math.floor(Math.random() * 400));
          }
          if (selectedLike) break;
        }
      }

      if (!selectedLike) {
        this.logger.warn(
          `[teamsAndPlayersDaily] ${lgBase} no like found after preflights. Proceeding with first candidate.`,
        );
        selectedLike = candidates[0];
      }

      // ---------- TEAMS ----------
      let teamsRes: { discovered: number; enriched: number; upserts: number } = {
        discovered: 0, enriched: 0, upserts: 0,
      };
      let likeUsedForTeams: string | null = null;

      try {
        teamsRes = await this.teamsSvc.upsertTeamsByLeagueNameLike(selectedLike, from, to);
        this.logger.log(
          `[teamsAndPlayersDaily] ${lgBase} teams [${selectedLike}]: ${JSON.stringify(teamsRes)}`,
        );
        if (teamsRes.discovered > 0) likeUsedForTeams = selectedLike;
      } catch (e) {
        this.logger.warn(
          `[teamsAndPlayersDaily] ${lgBase} teams error with like="${selectedLike}": ${String(e)}`,
        );
      }

      // Fallbacks si sigue 0 (con 1–2 reintentos por candidato)
      if (teamsRes.discovered === 0) {
        for (const like of candidates.filter(c => c !== selectedLike)) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await sleep(1200 + Math.floor(Math.random() * 800));
              const t2 = await this.teamsSvc.upsertTeamsByLeagueNameLike(like, from, to);
              this.logger.log(
                `[teamsAndPlayersDaily] ${lgBase} teams [fallback:${like}] ` +
                `(try ${attempt + 1}/2): ${JSON.stringify(t2)}`,
              );
              if (t2.discovered > 0) {
                teamsRes = t2;
                likeUsedForTeams = like;
                break;
              }
            } catch (e) {
              this.logger.warn(
                `[teamsAndPlayersDaily] ${lgBase} teams fallback error [${like}]: ${String(e)}`,
              );
            }
          }
          if (likeUsedForTeams) break;
        }
      }

      if (teamsRes.discovered === 0) {
        const dbg = Array.from(lgRaw)
          .map(c => `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase()})`)
          .join(' | ');
        this.logger.debug?.(
          `[teamsAndPlayersDaily] ${lgBase} teams discovered=0. raw="${lgRaw}" chars=${dbg}`,
        );
      }

      // ---------- PLAYERS ----------
      // Cooldown antes de pedir players (reduce “caché vacía”)
      await sleep(2500 + Math.floor(Math.random() * 1500));

      const playerCandidates = likeUsedForTeams
        ? [likeUsedForTeams, ...candidates.filter(c => c !== likeUsedForTeams)]
        : [selectedLike, ...candidates.filter(c => c !== selectedLike)];

      for (const like of playerCandidates) {
        try {
          const pRes = await this.statsSvc.upsertPlayersByLeagueNameLike(
            like, from, to, this.officialOnly,
          );
          this.logger.log(
            `[teamsAndPlayersDaily] ${lgBase} players [${like}]: ${JSON.stringify(pRes)}`,
          );
          if (pRes.discovered > 0) break;
          await sleep(1200 + Math.floor(Math.random() * 800));
        } catch (e) {
          this.logger.warn(
            `[teamsAndPlayersDaily] ${lgBase} players error with like="${like}": ${String(e)}`,
          );
          await sleep(1200);
        }
      }

      // ✅ Cooldown grande tras terminar una liga (8–12s)
      await sleep(8000 + Math.floor(Math.random() * 4000));
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
      // ✅ Ventana anual basada en CRON_LEAGUE_YEAR
      const year =
        Number(process.env.CRON_LEAGUE_YEAR) ||
        Number(this.year) ||
        new Date().getUTCFullYear();

      // Desde el 1 de enero 00:00:00 hasta el 12 de diciembre 23:59:59 de ese año
      const from = `${year}-01-01 00:00:00`;
      const to   = `${year}-12-12 23:59:59`;

      this.logger.log(`[gamesHourly] window (yearly): from=${from} to=${to} (year=${year})`);

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

      // Puedes mantener la normalización por ventana reciente en horas
      // (no interfiere con el rango anterior y ayuda a resolver team_ids de lo último insertado)
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
      // ✅ Ventana anual basada en CRON_LEAGUE_YEAR (fallback: this.year o current UTC year)
      const year =
        Number(process.env.CRON_LEAGUE_YEAR) ||
        Number(this.year) ||
        new Date().getUTCFullYear();

      const from = `${year}-01-01 00:00:00`;
      const to   = `${year}-12-31 23:59:59`; // ← usa 31 dic; si quieres 12 dic, cámbialo aquí

      this.logger.log(`[statsHourly] window (yearly): from=${from} to=${to} (year=${year})`);

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