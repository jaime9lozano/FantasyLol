// src/fantasy/valuation/valuation.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyPlayerValuation } from './fantasy-player-valuation.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { PayClauseDto } from './dto/pay-clause.dto';

@Injectable()
export class ValuationService {
  constructor(
    @InjectRepository(FantasyPlayerValuation) private valuations: Repository<FantasyPlayerValuation>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  async payClause(dto: PayClauseDto) {
    return this.ds.transaction(async (trx) => {
      const leagues = await trx.query(
        `SELECT id, clause_multiplier FROM public.fantasy_league WHERE id = $1`,
        [dto.fantasyLeagueId],
      );
      if (leagues.length === 0) throw new BadRequestException('Liga no encontrada');
      const league = leagues[0];

      const slots = await trx.query(
        `SELECT id, fantasy_team_id, player_id, clause_value::bigint AS clause_value, locked_until
          FROM public.fantasy_roster_slot
          WHERE fantasy_league_id = $1 AND player_id = $2 AND active = true
          FOR UPDATE`,
        [dto.fantasyLeagueId, dto.playerId],
      );
      if (slots.length === 0) throw new BadRequestException('Jugador no está en ningún equipo en esta liga');
      const slot = slots[0];
      if (slot.locked_until && new Date(slot.locked_until) > new Date()) {
        throw new BadRequestException('Jugador bloqueado');
      }

      const buyers = await trx.query(
        `SELECT id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
          FROM public.fantasy_team
          WHERE id = $1 AND fantasy_league_id = $2
          FOR UPDATE`,
        [dto.toTeamId, dto.fantasyLeagueId],
      );
      if (buyers.length === 0) throw new BadRequestException('Equipo destino inválido');
      const buyer = buyers[0];

      const vals = await trx.query(
        `SELECT current_value::bigint AS current_value
          FROM public.fantasy_player_valuation
          WHERE fantasy_league_id = $1 AND player_id = $2`,
        [dto.fantasyLeagueId, dto.playerId],
      );
      const base = BigInt(vals[0]?.current_value ?? slot.clause_value ?? 0n);
      const mult = Number(league.clause_multiplier ?? 1.5);
      const clause = (base * BigInt(Math.round(mult * 100))) / 100n;

      const available = BigInt(buyer.br) - BigInt(buyer.bz);
      if (available < clause) throw new BadRequestException('Saldo insuficiente');

      await trx.query(
        `UPDATE public.fantasy_team
            SET budget_remaining = budget_remaining - $1::bigint,
                updated_at=now()
          WHERE id = $2`,
        [clause.toString(), buyer.id],
      );

      await trx.query(
        `UPDATE public.fantasy_roster_slot
            SET active=false, valid_to=now(), updated_at=now()
          WHERE id = $1`,
        [slot.id],
      );

      await trx.query(
        `INSERT INTO public.fantasy_roster_slot
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, 'BENCH', false, true, $4::bigint, $4::bigint, now(), now(), now())`,
        [dto.fantasyLeagueId, buyer.id, dto.playerId, clause.toString()],
      );

      await trx.query(
        `INSERT INTO public.transfer_transaction (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type)
        VALUES ($1, $2, $3, $4, $5::bigint, 'CLAUSE_PAID')`,
        [dto.fantasyLeagueId, dto.playerId, slot.fantasy_team_id, buyer.id, clause.toString()],
      );

      return { ok: true, clause: clause.toString() };
    });
  }

  async recalcAllValues(fantasyLeagueId: number, asOf = new Date()) {
    // SQL eficiente: promedio últimos 5 partidos
    const rows: Array<{ player_id: number; avg_points: number }> = await this.ds.query(`
      WITH ranked AS (
        SELECT fpp.player_id, fpp.points::float AS points, g.datetime_utc,
               ROW_NUMBER() OVER (PARTITION BY fpp.player_id ORDER BY g.datetime_utc DESC) rn
        FROM public.fantasy_player_points fpp
        JOIN public.game g ON g.id = fpp.game_id
        WHERE fpp.fantasy_league_id = $1
      )
      SELECT player_id, AVG(points) AS avg_points
      FROM ranked WHERE rn <= 5
      GROUP BY player_id
    `, [fantasyLeagueId]);

    const min = 250_000, max = 50_000_000;
    for (const r of rows) {
      const raw = Math.round(250_000 + 120_000 * (r.avg_points ?? 0));
      const value = Math.max(min, Math.min(max, raw));
      await this.ds.query(`
        INSERT INTO public.fantasy_player_valuation (fantasy_league_id, player_id, current_value, last_change, calc_date)
        VALUES ($1, $2, $3, 0, $4)
        ON CONFLICT (fantasy_league_id, player_id)
        DO UPDATE SET current_value = EXCLUDED.current_value, updated_at = now(), calc_date = EXCLUDED.calc_date
      `, [fantasyLeagueId, r.player_id, value, asOf.toISOString().slice(0,10)]);
    }
    return { ok: true, updated: rows.length };
  }
}
