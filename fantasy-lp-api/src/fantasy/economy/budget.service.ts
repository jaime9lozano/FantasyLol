import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { T } from 'src/database/schema.util';

@Injectable()
export class BudgetService {
  constructor(private ds: DataSource) {}

  async applyDelta(fantasyLeagueId: number, fantasyTeamId: number, delta: bigint, type: string, metadata: any = {}, refId?: number) {
    return this.ds.transaction(async (qr) => {
      const [team] = await qr.query(`SELECT id, budget_remaining::bigint AS br FROM ${T('fantasy_team')} WHERE id = $1 AND fantasy_league_id = $2 FOR UPDATE`, [fantasyTeamId, fantasyLeagueId]);
      if (!team) throw new Error('Team not found for budget update');
      const newBalance = BigInt(team.br) + delta;
      if (newBalance < 0n) throw new Error('Saldo insuficiente');
      await qr.query(`UPDATE ${T('fantasy_team')} SET budget_remaining = $3::bigint, updated_at = now() WHERE id = $1 AND fantasy_league_id = $2`, [fantasyTeamId, fantasyLeagueId, newBalance.toString()]);
      await qr.query(`INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at) VALUES ($1,$2,$3,$4::bigint,$5::bigint,$6,$7::jsonb, now())`, [fantasyLeagueId, fantasyTeamId, type, delta.toString(), newBalance.toString(), refId ?? null, JSON.stringify(metadata)]);
      return { ok: true, balance: newBalance.toString() };
    });
  }
}
