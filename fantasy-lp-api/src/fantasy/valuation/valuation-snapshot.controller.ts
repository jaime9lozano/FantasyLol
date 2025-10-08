import { Controller, Get, Param } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { T } from 'src/database/schema.util';

@Controller('fantasy/valuation')
export class ValuationSnapshotController {
  constructor(private ds: DataSource) {}

  @Get('snapshot/:leagueId')
  async snapshot(@Param('leagueId') leagueIdParam: string) {
    const leagueId = Number(leagueIdParam);
    const [league] = await this.ds.query(`SELECT id, economic_config, clause_multiplier FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
    if (!league) return { ok: false, error: 'League not found' };

    const teams = await this.ds.query(
      `SELECT id, budget_remaining::bigint AS budget_remaining, budget_reserved::bigint AS budget_reserved, name
       FROM ${T('fantasy_team')}
       WHERE fantasy_league_id = $1`,
      [leagueId],
    );

    const rosterValues = await this.ds.query(
      `SELECT fr.fantasy_team_id, fr.player_id, fr.slot, fr.starter, v.current_value::bigint AS value, fr.clause_value::bigint AS clause_value
       FROM ${T('fantasy_roster_slot')} fr
       LEFT JOIN ${T('fantasy_player_valuation')} v ON v.fantasy_league_id = fr.fantasy_league_id AND v.player_id = fr.player_id
       WHERE fr.fantasy_league_id = $1 AND fr.active = true AND fr.valid_to IS NULL`,
      [leagueId],
    );

    const teamAggregates = new Map<number, any>();
    for (const t of teams) {
      teamAggregates.set(Number(t.id), {
        teamId: Number(t.id),
        name: t.name,
        budgetRemaining: t.budget_remaining.toString(),
        budgetReserved: t.budget_reserved?.toString?.() ?? '0',
        rosterValueSum: 0n,
        players: [],
      });
    }
    for (const r of rosterValues) {
      const agg = teamAggregates.get(Number(r.fantasy_team_id));
      if (!agg) continue;
      agg.rosterValueSum += BigInt(r.value ?? 0);
      agg.players.push({
        playerId: Number(r.player_id),
        slot: r.slot,
        starter: !!r.starter,
        value: r.value ? r.value.toString() : '0',
        clauseValue: r.clause_value ? r.clause_value.toString() : '0',
      });
    }
    const teamsOut = Array.from(teamAggregates.values()).map(t => ({
      ...t,
      rosterValueSum: t.rosterValueSum.toString(),
      avgPlayerValue: t.players.length ? (Number(t.rosterValueSum) / t.players.length).toFixed(0) : '0'
    }));

    const topPlayers = rosterValues
      .filter(r => r.value)
      .sort((a,b)=> Number(b.value) - Number(a.value))
      .slice(0, 15)
      .map(r => ({ playerId: Number(r.player_id), value: r.value.toString(), teamId: Number(r.fantasy_team_id) }));

    const totalBudgetRemaining = teams.reduce((acc, t) => acc + BigInt(t.budget_remaining), 0n);
    const totalRosterValue = teamsOut.reduce((acc, t) => acc + BigInt(t.rosterValueSum), 0n);

    return {
      ok: true,
      leagueId,
      generatedAt: new Date().toISOString(),
      economy: {
        config: league.economic_config || {},
        clauseMultiplier: league.clause_multiplier,
        totalBudgetRemaining: totalBudgetRemaining.toString(),
        totalRosterValue: totalRosterValue.toString(),
      },
      teams: teamsOut,
      topPlayers,
    };
  }
}