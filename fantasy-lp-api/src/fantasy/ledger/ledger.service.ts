import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { T } from 'src/database/schema.util';

type ListArgs = {
  leagueId: number;
  teamId?: number;
  type?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class LedgerService {
  constructor(private ds: DataSource) {}

  async list(args: ListArgs) {
    const { leagueId, teamId, type, from, to, page, pageSize } = args;
    const where: string[] = ['fbl.fantasy_league_id = $1'];
    const params: any[] = [leagueId];
    if (teamId) { where.push('fbl.fantasy_team_id = $' + (params.length + 1)); params.push(teamId); }
    if (type) { where.push('fbl.type = $' + (params.length + 1)); params.push(type); }
    if (from) { where.push('fbl.created_at >= $' + (params.length + 1)); params.push(new Date(from)); }
    if (to) { where.push('fbl.created_at <= $' + (params.length + 1)); params.push(new Date(to)); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const offset = (page - 1) * pageSize;
    const totalRows = await this.ds.query(`SELECT COUNT(*)::int AS c FROM ${T('fantasy_budget_ledger')} fbl ${whereSql}`, params);
    const total = Number(totalRows[0]?.c ?? 0);

    const items = await this.ds.query(
      `SELECT id, fantasy_league_id, fantasy_team_id, type, delta::bigint AS delta, balance_after::bigint AS balance_after, ref_id, metadata, created_at
       FROM ${T('fantasy_budget_ledger')} fbl
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return { items, page, pageSize, total, serverTime: new Date().toISOString() };
  }
}
