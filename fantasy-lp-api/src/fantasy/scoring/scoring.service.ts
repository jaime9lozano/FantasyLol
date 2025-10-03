// src/fantasy/scoring/scoring.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyScoringPeriod } from './fantasy-scoring-period.entity';
import { FantasyPlayerPoints } from './fantasy-player-points.entity';
import { FantasyTeamPoints } from './fantasy-team-points.entity';
import { PlayerGameStats } from 'src/entities/player-game-stats.entity';

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectRepository(FantasyScoringPeriod) private periods: Repository<FantasyScoringPeriod>,
    @InjectRepository(FantasyPlayerPoints) private ppoints: Repository<FantasyPlayerPoints>,
    @InjectRepository(FantasyTeamPoints) private tpoints: Repository<FantasyTeamPoints>,
    @InjectRepository(PlayerGameStats) private pgs: Repository<PlayerGameStats>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  private calcPoints(stats: any, cfg: any): number {
    const kills = stats.kills ?? 0;
    const assists = stats.assists ?? 0;
    const deaths = stats.deaths ?? 0;
    const cs = stats.cs ?? 0;
    const win = stats.playerWin ?? stats.player_win ? 1 : 0;
    const points = kills * (cfg.kill ?? 3)
      + assists * (cfg.assist ?? 2)
      + deaths * (cfg.death ?? -1)
      + Math.floor(cs / 10) * (cfg.cs10 ?? 0.5)
      + win * (cfg.win ?? 2);
    return Number(points.toFixed(2));
  }

  async computeForPeriod(fantasyLeagueId: number, periodId: number) {
    const league = await this.leagues.findOne({ where: { id: fantasyLeagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');
    const period = await this.periods.findOne({ where: { id: periodId, fantasyLeague: { id: fantasyLeagueId } as any } });
    if (!period) throw new BadRequestException('Periodo no encontrado');

    // 1) puntos por jugador+game en ventana periodo (por fecha del game)
    const stats = await this.pgs.createQueryBuilder('s')
      .leftJoinAndSelect('s.game', 'g')
      .where('g.datetime_utc BETWEEN :a AND :b', { a: period.startsAt, b: period.endsAt })
      .getMany();

    for (const s of stats) {
      const points = this.calcPoints(s as any, league.scoringConfig ?? {});
      await this.ppoints.upsert({
        fantasyLeague: { id: fantasyLeagueId } as any,
        player: { id: (s as any).playerId } as any,
        game: { id: (s as any).gameId } as any,
        points: points.toFixed(2),
      } as any, ['fantasyLeague','player','game']);
    }

    // 2) Agregado por equipo (titulares activos)
    await this.ds.query(`
      INSERT INTO public.fantasy_team_points (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id, points)
      SELECT fr.fantasy_league_id, fr.fantasy_team_id, $1::int AS period_id, COALESCE(SUM(fpp.points),0)
      FROM public.fantasy_roster_slot fr
      LEFT JOIN public.fantasy_player_points fpp
        ON fpp.fantasy_league_id = fr.fantasy_league_id AND fpp.player_id = fr.player_id
      WHERE fr.fantasy_league_id = $2 AND fr.active = true AND fr.starter = true
      GROUP BY fr.fantasy_league_id, fr.fantasy_team_id
      ON CONFLICT (fantasy_league_id, fantasy_team_id, fantasy_scoring_period_id)
      DO UPDATE SET points = EXCLUDED.points
    `, [periodId, fantasyLeagueId]);

    // 3) Si falta alguna posición titular requerida, puntos del periodo = 0
    const requiredSlots: string[] = Array.isArray(league.rosterConfig?.slots)
      ? league.rosterConfig.slots
      : ['TOP','JNG','MID','ADC','SUP'];

    // Obtenemos los teams de la liga
    const teams: Array<{ id: number }> = await this.ds.query(
      `SELECT id FROM public.fantasy_team WHERE fantasy_league_id = $1`, [fantasyLeagueId]
    );

    for (const t of teams) {
      // Count por slot de titulares activos del equipo
      const rows: Array<{ slot: string; n: string }> = await this.ds.query(
        `SELECT slot, COUNT(*)::int AS n
           FROM public.fantasy_roster_slot
          WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND active = true AND starter = true
          GROUP BY slot`,
        [fantasyLeagueId, t.id]
      );
      const have = new Map(rows.map(r => [r.slot, Number(r.n)]));
      const complete = requiredSlots.every(s => (have.get(s) ?? 0) >= 1);
      if (!complete) {
        await this.ds.query(
          `UPDATE public.fantasy_team_points
              SET points = 0, updated_at = now()
            WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND fantasy_scoring_period_id = $3`,
          [fantasyLeagueId, t.id, periodId]
        );
      }
    }

    // 4) Totales por equipo
    await this.ds.query(`
      UPDATE public.fantasy_team t
      SET points_total = COALESCE((
        SELECT SUM(tp.points)::numeric
        FROM public.fantasy_team_points tp
        WHERE tp.fantasy_league_id = t.fantasy_league_id AND tp.fantasy_team_id = t.id
      ), 0)
      WHERE t.fantasy_league_id = $1
    `, [fantasyLeagueId]);

    return { ok: true };
  }
}