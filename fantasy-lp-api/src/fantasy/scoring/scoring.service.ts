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
    const win =
      stats.playerWin ?? stats.player_win ? 1 : 0; // soporta snakeCase o camelCase
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

    await this.ds.transaction(async (qr) => {
      // 1) Leer stats por partido dentro del periodo (JOIN a public.game explícito)
      // ⚠️ Si la columna de fecha no es 'datetime_utc', cámbiala aquí por la correcta.
      const statsRows: Array<{
        player_id: number;
        game_id: number;
        kills: number;
        assists: number;
        deaths: number;
        cs: number;
        player_win: number | boolean;
      }> = await qr.query(
        `
        SELECT
          s.player_id::bigint AS player_id,
          s.game_id::bigint AS game_id,
          s.kills,
          s.assists,
          s.deaths,
          s.cs,
          COALESCE(s.player_win, s.playerWin) AS player_win
        FROM public.player_game_stats s
        JOIN public.game g
          ON g.id = s.game_id
        WHERE g.datetime_utc BETWEEN $1 AND $2
        `,
        [from, to],
      );

      // 2) Upsert de puntos por jugador/partido en el schema activo (test)
      for (const s of statsRows) {
        const points = this.calcPoints(s, league.scoringConfig ?? {});
        await qr.query(
          `
          INSERT INTO ${T('fantasy_player_points')}
            (fantasy_league_id, player_id, game_id, points)
          VALUES ($1, $2, $3, $4::numeric)
          ON CONFLICT (fantasy_league_id, player_id, game_id)
          DO UPDATE SET points = EXCLUDED.points, updated_at = now()
          `,
          [fantasyLeagueId, s.player_id, s.game_id, points],
        );
      }

      // 3) Agregado por equipo SOLO con puntos del periodo
      await qr.query(
        `
        INSERT INTO ${T('fantasy_team_points')}
          (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id, points)
        SELECT
          fr.fantasy_league_id,
          fr.fantasy_team_id,
          $1::int AS period_id,
          COALESCE(SUM(fpp.points), 0)::numeric AS points
        FROM ${T('fantasy_roster_slot')} fr
        LEFT JOIN ${T('fantasy_player_points')} fpp
          ON fpp.fantasy_league_id = fr.fantasy_league_id
         AND fpp.player_id = fr.player_id
        LEFT JOIN public.game g
          ON g.id = fpp.game_id
         AND g.datetime_utc BETWEEN $3 AND $4
        WHERE fr.fantasy_league_id = $2
          AND fr.active = true
          AND fr.starter = true
        GROUP BY fr.fantasy_league_id, fr.fantasy_team_id
        ON CONFLICT (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id)
        DO UPDATE SET points = EXCLUDED.points, updated_at = now()
        `,
        [periodId, fantasyLeagueId, from, to],
      );

      // 4) Penalización por lineup incompleto: si falta algún slot requerido => 0
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

      // 5) Totales por equipo (sumatorio de team_points dentro de esta liga)
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
}