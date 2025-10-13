import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { T } from 'src/database/schema.util';

/**
 * Service: distribuye recompensas monetarias a equipos al cerrar una jornada.
 * Fórmula simple:
 *  - Bonus base por participación: 50k
 *  - Bonus variable: points * 5k (cap 2M)
 *  - Bonus ranking extra: +200k al 1º, +100k al 2º, +50k al 3º.
 */
@Injectable()
export class ScoringRewardsService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async rewardPeriod(fantasyLeagueId: number, periodId: number) {
    return this.ds.transaction(async (qr) => {
      // Leer puntos de la jornada
      const rows: Array<{ fantasy_team_id: number; points: string }> = await qr.query(
        `SELECT fantasy_team_id, points::numeric AS points
         FROM ${T('fantasy_team_points')}
         WHERE fantasy_league_id = $1 AND fantasy_scoring_period_id = $2`,
        [fantasyLeagueId, periodId],
      );
      if (!rows.length) return { ok: true, rewarded: 0 };
      const [lg] = await qr.query(`SELECT economic_config, clause_multiplier FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
      const eco = lg?.economic_config || {};
      const rw = eco.rewards || {};
      const base = Number(rw.base ?? 50000);
      const perPoint = Number(rw.perPoint ?? 5000);
      const perPointCap = Number(rw.perPointCap ?? 2000000);
      const rankBonuses: number[] = Array.isArray(rw.rankBonuses) ? rw.rankBonuses : [200000,100000,50000];
      // Ranking por puntos desc
      const ranked = [...rows].sort((a,b)=> Number(b.points)-Number(a.points));
      const rankingMap = new Map<number, number>();
      ranked.forEach((r,i)=> rankingMap.set(r.fantasy_team_id, i+1));

      let rewarded = 0;
      for (const r of rows) {
        // Idempotencia por equipo/periodo: si ya hay ledger REWARD_PERIOD para ese ref_id y team, saltar
        const already: Array<{ ok: number }> = await qr.query(
          `SELECT 1 AS ok FROM ${T('fantasy_budget_ledger')}
           WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND type = 'REWARD_PERIOD' AND ref_id = $3
           LIMIT 1`,
          [fantasyLeagueId, r.fantasy_team_id, periodId],
        );
        if (already.length) continue;
        const pts = Number(r.points);
        const variable = Math.min(pts * perPoint, perPointCap);
        const rank = rankingMap.get(r.fantasy_team_id) || 0;
        const rankBonus = rankBonuses[rank-1] ?? 0;
        const total = base + variable + rankBonus;
        // Ledger update
        const [team] = await qr.query(`SELECT budget_remaining::bigint AS br FROM ${T('fantasy_team')} WHERE id = $1 AND fantasy_league_id = $2 FOR UPDATE`, [r.fantasy_team_id, fantasyLeagueId]);
        const newBal = (BigInt(team.br) + BigInt(total));
        await qr.query(`UPDATE ${T('fantasy_team')} SET budget_remaining = $3::bigint, updated_at = now() WHERE id = $1 AND fantasy_league_id = $2`, [r.fantasy_team_id, fantasyLeagueId, newBal.toString()]);
        await qr.query(`INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at) VALUES ($1,$2,'REWARD_PERIOD',$3::bigint,$4::bigint,$5,$6::jsonb, now())`, [fantasyLeagueId, r.fantasy_team_id, total, newBal.toString(), periodId, JSON.stringify({ points: pts, rank })]);
        rewarded++;
      }
      return { ok: true, rewarded };
    });
  }
}