// src/fantasy/scoring/scoring.service.ts
// src/fantasy/scoring/scoring.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { T } from 'src/database/schema.util';
import { PlayerGameStats } from 'src/entities/player-game-stats.entity';
import { FantasyScoringPeriod } from './fantasy-scoring-period.entity';
import { FantasyTeamPoints } from './fantasy-team-points.entity';

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectRepository(FantasyScoringPeriod) private periods: Repository<FantasyScoringPeriod>,
    @InjectRepository(FantasyTeamPoints) private tpoints: Repository<FantasyTeamPoints>,
    @InjectRepository(PlayerGameStats) private pgs: Repository<PlayerGameStats>,
    @InjectDataSource() private ds: DataSource,
  ) {}

 private calcPoints(stats: any, cfg: any): number {
    const kills = stats.kills ?? 0;
    const assists = stats.assists ?? 0;
    const deaths = stats.deaths ?? 0;
    const cs = stats.cs ?? 0;

    // Soporta snake_case (raw SQL) y camelCase (entidad ORM),
    // con paréntesis para evitar precedencia rara.
    const playerWinValue =
      (typeof stats.player_win !== 'undefined' ? stats.player_win : stats.playerWin) ?? false;
    const win = playerWinValue ? 1 : 0;

    const points =
      kills * (cfg.kill ?? 3) +
      assists * (cfg.assist ?? 2) +
      deaths * (cfg.death ?? -1) +
      Math.floor(cs / 10) * (cfg.cs10 ?? 0.5) +
      win * (cfg.win ?? 2);

    return Number(points.toFixed(2));
  }

  async computeForPeriod(fantasyLeagueId: number, periodId: number) {
  const league = await this.leagues.findOne({ where: { id: fantasyLeagueId } });
  if (!league) throw new BadRequestException('Liga no encontrada');

  const period = await this.periods.findOne({
    where: { id: periodId, fantasyLeague: { id: fantasyLeagueId } as any },
  });
  if (!period) throw new BadRequestException('Periodo no encontrado');

  const from = period.startsAt;
  const to = period.endsAt;

  const coreLeagueId = (league as any).sourceLeagueId ?? null;

  await this.ds.transaction(async (qr) => {
    // 1) Upsert vectorizado de puntos del periodo
    const cfg = league.scoringConfig ?? {};
    const killW = Number(cfg.kill ?? 3);
    const assistW = Number(cfg.assist ?? 2);
    const deathW = Number(cfg.death ?? -1);
    const cs10W = Number(cfg.cs10 ?? 0.5);
    const winW = Number(cfg.win ?? 2);

    await qr.query(
      `WITH base_games AS (
         SELECT g.id AS game_id
         FROM public.game g
         ${coreLeagueId ? `JOIN public.tournament t ON t.id = g.tournament_id` : ''}
         WHERE g.datetime_utc BETWEEN $1 AND $2
           ${coreLeagueId ? `AND (
             t.league = (SELECT code FROM public.league WHERE id = $3)
             OR t.league ILIKE (SELECT code FROM public.league WHERE id = $3) || '%'
             OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE (SELECT code FROM public.league WHERE id = $3) || '%')
           )` : ''}
       ),
       stats AS (
         SELECT pgs.player_id, pgs.game_id, pgs.kills, pgs.assists, pgs.deaths, pgs.cs, pgs.player_win
         FROM public.player_game_stats pgs
         JOIN base_games bg ON bg.game_id = pgs.game_id
       )
       INSERT INTO ${T('fantasy_player_points')} (fantasy_league_id, player_id, game_id, points)
       SELECT $4::int AS fantasy_league_id,
              s.player_id,
              s.game_id,
              (
                COALESCE(s.kills,0) * $5 +
                COALESCE(s.assists,0) * $6 +
                COALESCE(s.deaths,0) * $7 +
                FLOOR(COALESCE(s.cs,0)/10.0) * $8 +
                (CASE WHEN s.player_win THEN 1 ELSE 0 END) * $9
              )::numeric AS points
       FROM stats s
       ON CONFLICT (fantasy_league_id, player_id, game_id)
       DO UPDATE SET points = EXCLUDED.points, updated_at = now()`,
      coreLeagueId
        ? [from, to, coreLeagueId, fantasyLeagueId, killW, assistW, deathW, cs10W, winW]
        : [from, to, null, fantasyLeagueId, killW, assistW, deathW, cs10W, winW],
    );

    // 3) Agregado por equipo considerando pertenencia temporal (valid_from / valid_to)
    // Un punto de un jugador en un game cuenta para el equipo que lo tenía activo y starter en ese instante.
    const teamPointsBase = `
      INSERT INTO ${T('fantasy_team_points')}
        (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id, points)
      SELECT
        fr.fantasy_league_id,
        fr.fantasy_team_id,
        $1::int AS period_id,
        COALESCE(SUM(fpp.points), 0)::numeric AS points
      FROM ${T('fantasy_roster_slot')} fr
      JOIN ${T('fantasy_player_points')} fpp
        ON fpp.fantasy_league_id = fr.fantasy_league_id
       AND fpp.player_id = fr.player_id
      JOIN public.game g ON g.id = fpp.game_id
      WHERE fr.fantasy_league_id = $2
        AND fr.starter = true
        AND fr.active = true -- slot abierto actualmente
        AND g.datetime_utc BETWEEN $3 AND $4
        AND g.datetime_utc >= fr.valid_from
        AND (fr.valid_to IS NULL OR g.datetime_utc < fr.valid_to)
        ${coreLeagueId ? `AND g.tournament_id IN (
          SELECT t.id FROM public.tournament t
          WHERE t.league = (SELECT code FROM public.league WHERE id = $5)
           OR t.league ILIKE (SELECT code FROM public.league WHERE id = $5) || '%'
           OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE (SELECT code FROM public.league WHERE id = $5) || '%')
        )` : ''}
      GROUP BY fr.fantasy_league_id, fr.fantasy_team_id
      ON CONFLICT (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id)
      DO UPDATE SET points = EXCLUDED.points, updated_at = now()`;
    const params = coreLeagueId ? [periodId, fantasyLeagueId, from, to, coreLeagueId] : [periodId, fantasyLeagueId, from, to];
    await qr.query(teamPointsBase, params);

    // 4) Penalización por lineup incompleto
    const requiredSlots: string[] = Array.isArray(league.rosterConfig?.slots)
      ? league.rosterConfig.slots
      : ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];

    const teams: Array<{ id: number }> = await qr.query(
      `SELECT id FROM ${T('fantasy_team')} WHERE fantasy_league_id = $1`,
      [fantasyLeagueId],
    );

    for (const t of teams) {
      const rows: Array<{ slot: string; n: number }> = await qr.query(
        `
        SELECT slot, COUNT(*)::int AS n
        FROM ${T('fantasy_roster_slot')}
        WHERE fantasy_league_id = $1
          AND fantasy_team_id = $2
          AND active = true
          AND starter = true
        GROUP BY slot
        `,
        [fantasyLeagueId, t.id],
      );

      const have = new Map(rows.map((r) => [r.slot, Number(r.n)]));
      const complete = requiredSlots.every((s) => (have.get(s) ?? 0) >= 1);

      if (!complete) {
        await qr.query(
          `
          UPDATE ${T('fantasy_team_points')}
          SET points = 0, updated_at = now()
          WHERE fantasy_league_id = $1
            AND fantasy_team_id = $2
            AND fantasy_scoring_period_id = $3
          `,
          [fantasyLeagueId, t.id, periodId],
        );
      }
    }

    // 5) Totales por equipo
    await qr.query(
      `
      UPDATE ${T('fantasy_team')} t
      SET points_total = COALESCE((
        SELECT SUM(tp.points)::numeric
        FROM ${T('fantasy_team_points')} tp
        WHERE tp.fantasy_league_id = t.fantasy_league_id
          AND tp.fantasy_team_id = t.id
      ), 0),
      updated_at = now()
      WHERE t.fantasy_league_id = $1
      `,
      [fantasyLeagueId],
    );
  });

  return { ok: true };
}

  /**
   * Backfill histórico de puntos de jugadores para TODOS los games de la liga core (todas sus splits/torneos).
   * No afecta puntos de equipo (team_points) ni periodos; sólo fantasy_player_points.
   */
  async backfillAllPlayerPoints(fantasyLeagueId: number) {
    const league = await this.leagues.findOne({ where: { id: fantasyLeagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');
    const coreLeagueId = (league as any).sourceLeagueId ?? null;
    if (!coreLeagueId) return { ok: true, inserted: 0, updated: 0 };

    const cfg = league.scoringConfig ?? {};
    // Pesos (defaults) extraídos tal cual de calcPoints para vectorizar directamente en SQL
    const killW = Number(cfg.kill ?? 3);
    const assistW = Number(cfg.assist ?? 2);
    const deathW = Number(cfg.death ?? -1);
    const cs10W = Number(cfg.cs10 ?? 0.5);
    const winW = Number(cfg.win ?? 2);

    const result = await this.ds.transaction(async (qr) => {
      const [row] = await qr.query(
        `WITH code AS (SELECT code FROM public.league WHERE id = $1),
          league_games AS (
            SELECT g.id AS game_id
            FROM public.game g
            JOIN public.tournament t ON t.id = g.tournament_id
            JOIN code c ON TRUE
            WHERE (
              t.league = c.code
              OR t.league ILIKE c.code || '%'
              OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE c.code || '%')
            )
          ),
          raw_stats AS (
            SELECT pgs.player_id, pgs.game_id, pgs.kills, pgs.assists, pgs.deaths, pgs.cs, pgs.player_win
            FROM public.player_game_stats pgs
            JOIN league_games lg ON lg.game_id = pgs.game_id
          ),
          ins AS (
            INSERT INTO ${T('fantasy_player_points')} (fantasy_league_id, player_id, game_id, points)
            SELECT
              $2::int AS fantasy_league_id,
              rs.player_id,
              rs.game_id,
              (
                COALESCE(rs.kills,0) * $3 +
                COALESCE(rs.assists,0) * $4 +
                COALESCE(rs.deaths,0) * $5 +
                FLOOR(COALESCE(rs.cs,0) / 10.0) * $6 +
                (CASE WHEN rs.player_win THEN 1 ELSE 0 END) * $7
              )::numeric AS points
            FROM raw_stats rs
            ON CONFLICT (fantasy_league_id, player_id, game_id)
            DO UPDATE SET points = EXCLUDED.points, updated_at = now()
            RETURNING (xmax = 0) AS inserted
          )
          SELECT
            COALESCE(COUNT(*) FILTER (WHERE inserted), 0)::int AS inserted,
            COALESCE(COUNT(*) FILTER (WHERE NOT inserted), 0)::int AS updated
          FROM ins`,
        [coreLeagueId, fantasyLeagueId, killW, assistW, deathW, cs10W, winW],
      );
      return { inserted: Number(row?.inserted ?? 0), updated: Number(row?.updated ?? 0) };
    });

    return { ok: true, ...result };
  }

  /**
   * Genera periodos ("jornadas") automáticamente. Estrategia default: semanas naturales (lunes 00:00 UTC - domingo 23:59:59).
   * Si ya existen periodos no duplica.
   */
  async autoGenerateWeeklyPeriods(fantasyLeagueId: number, strategy: string = 'WEEKLY') {
    const league = await this.leagues.findOne({ where: { id: fantasyLeagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');

    const coreLeagueId = (league as any).sourceLeagueId ?? null;
    if (!coreLeagueId) return { ok: true, created: 0 };

    // Rango de fechas de los games de la liga core
    const range = await this.ds.query(
      `WITH code AS (SELECT code FROM public.league WHERE id = $1),
        lg AS (
          SELECT g.datetime_utc
          FROM public.game g
          JOIN public.tournament t ON t.id = g.tournament_id
          JOIN code c ON TRUE
          WHERE (
            t.league = c.code
            OR t.league ILIKE c.code || '%'
            OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE c.code || '%')
          )
        )
        SELECT MIN(datetime_utc) AS min_dt, MAX(datetime_utc) AS max_dt FROM lg`,
      [coreLeagueId],
    );
    const minDt = range[0]?.min_dt ? new Date(range[0].min_dt) : null;
    const maxDt = range[0]?.max_dt ? new Date(range[0].max_dt) : null;
    if (!minDt || !maxDt) return { ok: true, created: 0 };

    // Normalizar a lunes 00:00 UTC
    function startOfWeek(d: Date): Date {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const day = x.getUTCDay(); // 0=Domingo
      const diff = (day === 0 ? -6 : 1 - day); // llevar a lunes
      x.setUTCDate(x.getUTCDate() + diff);
      return x;
    }
    const firstWeekStart = startOfWeek(minDt);

    const periods: Array<{ name: string; starts: Date; ends: Date }> = [];
    let cursor = new Date(firstWeekStart);
    let index = 1;
    while (cursor <= maxDt) {
      const start = new Date(cursor);
      const end = new Date(cursor); end.setUTCDate(end.getUTCDate() + 7); end.setUTCSeconds(end.getUTCSeconds() - 1);
      periods.push({ name: `Week ${index}`, starts: start, ends: end });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      index++;
    }

    // Filtrar los que ya existen (comparando overlap por starts_at)
    const existing: Array<{ starts_at: Date }> = await this.ds.query(
      `SELECT starts_at FROM ${T('fantasy_scoring_period')} WHERE fantasy_league_id = $1`,
      [fantasyLeagueId],
    );
    const existingSet = new Set(existing.map(r => new Date(r.starts_at).toISOString()));
    let created = 0;
    for (const p of periods) {
      if (existingSet.has(p.starts.toISOString())) continue;
      await this.ds.query(
        `INSERT INTO ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())`,
        [fantasyLeagueId, p.name, p.starts.toISOString(), p.ends.toISOString()],
      );
      created++;
    }
    return { ok: true, created };
  }
}