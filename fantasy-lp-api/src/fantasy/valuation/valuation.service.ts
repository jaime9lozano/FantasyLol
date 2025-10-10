// src/fantasy/valuation/valuation.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyPlayerValuation } from './fantasy-player-valuation.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { PayClauseDto } from './dto/pay-clause.dto';
import { T } from '../../database/schema.util';
import { BudgetService } from '../economy/budget.service';
import { assertPlayerEligible } from '../leagues/league-pool.util';

@Injectable()
export class ValuationService {
  constructor(
    @InjectRepository(FantasyPlayerValuation) private valuations: Repository<FantasyPlayerValuation>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectDataSource() private ds: DataSource,
    private budget: BudgetService,
  ) {}

  async payClause(dto: PayClauseDto) {
    return this.ds.transaction(async (trx) => {
      // Liga (fantasy) -> usar schema activo
      const leagues = await trx.query(
        `SELECT id, clause_multiplier FROM ${T('fantasy_league')} WHERE id = $1`,
        [dto.fantasyLeagueId],
      );
      if (leagues.length === 0) throw new BadRequestException('Liga no encontrada');
      const league = leagues[0];

  // Verifica elegibilidad (no permitir pagar cláusula por jugador fuera del pool)
  await assertPlayerEligible(this.ds, dto.fantasyLeagueId, dto.playerId, 'payClause');

  // Slot actual del jugador (fantasy) con bloqueo
      const slots = await trx.query(
        `
        SELECT id, fantasy_team_id, player_id, clause_value::bigint AS clause_value, locked_until
        FROM ${T('fantasy_roster_slot')}
        WHERE fantasy_league_id = $1 AND player_id = $2 AND active = true
        FOR UPDATE
        `,
        [dto.fantasyLeagueId, dto.playerId],
      );
      if (slots.length === 0) throw new BadRequestException('Jugador no está en ningún equipo en esta liga');
      const slot = slots[0];
      if (slot.locked_until && new Date(slot.locked_until) > new Date()) {
        throw new BadRequestException('Jugador bloqueado');
      }

      // Nota: permitimos pagar cláusula aunque existan ofertas/órdenes de mercado abiertas.

      // Equipo destino (fantasy) con bloqueo
      const buyers = await trx.query(
        `
        SELECT id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
        FROM ${T('fantasy_team')}
        WHERE id = $1 AND fantasy_league_id = $2
        FOR UPDATE
        `,
        [dto.toTeamId, dto.fantasyLeagueId],
      );
      if (buyers.length === 0) throw new BadRequestException('Equipo destino inválido');
      const buyer = buyers[0];

      // Capacidad del roster (máximo 6 activos)
      const [cntRow] = await trx.query(
        `SELECT COUNT(*)::int AS c FROM ${T('fantasy_roster_slot')} 
         WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND active = true`,
        [dto.fantasyLeagueId, buyer.id],
      );
      if (Number(cntRow?.c ?? 0) >= 6) {
        throw new BadRequestException('Plantilla completa: máximo 6 jugadores. Vende antes de comprar.');
      }

      // Valor base (fantasy valuation)
      const vals = await trx.query(
        `
        SELECT current_value::bigint AS current_value
        FROM ${T('fantasy_player_valuation')}
        WHERE fantasy_league_id = $1 AND player_id = $2
        `,
        [dto.fantasyLeagueId, dto.playerId],
      );
      const base = BigInt(vals[0]?.current_value ?? slot.clause_value ?? 0n);
      const mult = Number(league.clause_multiplier ?? 1.5);
      const clause = (base * BigInt(Math.round(mult * 100))) / 100n;

      // Saldo
      const available = BigInt(buyer.br) - BigInt(buyer.bz);
      if (available < clause) throw new BadRequestException('Saldo insuficiente');

      // Registrar en ledger (delta negativo)
      const newBal = BigInt(buyer.br) - clause;
      if (newBal < 0n) throw new BadRequestException('Saldo insuficiente');
      await trx.query(`UPDATE ${T('fantasy_team')} SET budget_remaining = $3::bigint, updated_at = now() WHERE id = $1 AND fantasy_league_id = $2`, [buyer.id, dto.fantasyLeagueId, newBal.toString()]);
      await trx.query(`INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at) VALUES ($1,$2,'CLAUSE_PAYMENT',-$3::bigint,$4::bigint,NULL,$5::jsonb, now())`, [dto.fantasyLeagueId, buyer.id, clause.toString(), newBal.toString(), JSON.stringify({ playerId: dto.playerId })]);

      const effective = dto.effectiveAt ? new Date(dto.effectiveAt) : new Date();
      // Cierra el slot del vendedor en la fecha efectiva
      await trx.query(
        `
        UPDATE ${T('fantasy_roster_slot')}
        SET active=false, valid_to=$2, updated_at=now()
        WHERE id = $1
        `,
        [slot.id, effective.toISOString()],
      );

      // Regla de autopromoción: si el slot original era starter y no BENCH, el nuevo entra con mismo slot y starter=true.
      // Caso contrario: entra como BENCH starter=false.
      const originalSlotRow = await trx.query(
        `SELECT slot, starter FROM ${T('fantasy_roster_slot')} WHERE id = $1`,
        [slot.id],
      );
      const originalSlot = originalSlotRow[0]?.slot ?? 'BENCH';
      const originalStarter = !!originalSlotRow[0]?.starter;
      const newSlot = originalStarter && originalSlot !== 'BENCH' ? originalSlot : 'BENCH';
      const newStarter = originalStarter && originalSlot !== 'BENCH';

      // Crea slot en comprador con valid_from effectiveAt y posibles starter/slot adaptados
      await trx.query(
        `
        INSERT INTO ${T('fantasy_roster_slot')}
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, $6, $7, true, $4::bigint, $4::bigint, $5, now(), now())
        `,
        [dto.fantasyLeagueId, buyer.id, dto.playerId, clause.toString(), effective.toISOString(), newSlot, newStarter],
      );

      // Auditoría (transfer_transaction, fantasy)
      await trx.query(
        `
        INSERT INTO ${T('transfer_transaction')}
          (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type)
        VALUES ($1, $2, $3, $4, $5::bigint, 'CLAUSE_PAID')
        `,
        [dto.fantasyLeagueId, dto.playerId, slot.fantasy_team_id, buyer.id, clause.toString()],
      );

      return { ok: true, clause: clause.toString() };
    });
  }

  async recalcAllValues(fantasyLeagueId: number, asOf = new Date()) {
    // Core: 'game' se queda en public. Fantasy: usar schema activo.
    const rows: Array<{ player_id: number; avg_points: number }> = await this.ds.query(
      `
      WITH ranked AS (
        SELECT
          fpp.player_id,
          fpp.points::float AS points,
          g.datetime_utc,
          ROW_NUMBER() OVER (PARTITION BY fpp.player_id ORDER BY g.datetime_utc DESC) rn
        FROM ${T('fantasy_player_points')} fpp
        JOIN public.game g ON g.id = fpp.game_id
        WHERE fpp.fantasy_league_id = $1
      )
      SELECT player_id, AVG(points) AS avg_points
      FROM ranked
      WHERE rn <= 5
      GROUP BY player_id
      `,
      [fantasyLeagueId],
    );
    // Número de periodos finalizados (ends_at <= asOf) para amortiguar inflación de valores.
    const [pc] = await this.ds.query(
      `SELECT COUNT(*)::int AS c FROM ${T('fantasy_scoring_period')} WHERE fantasy_league_id = $1 AND ends_at <= $2`,
      [fantasyLeagueId, asOf.toISOString()],
    );
    const periodsCompleted = Number(pc?.c ?? 0);
    // Fórmula escalable:
    // base_linear = 250k + 180k * avg_points
    // boost cuadrático a partir de 20 puntos: + 50k * (max(avg_points-20,0))^2
    // hard cap elevado a 200M para jugadores élite.
  // Cargar configuración económica
  const [econRow] = await this.ds.query(`SELECT economic_config FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
  const econ = econRow?.economic_config || {};
  const valCfg = econ.valuation || {};
  const dampCfg = econ.dampening || {};
  const inactCfg = econ.inactivity || {};
  // Requisito: mínimo absoluto 1.000.000 (aunque econ_config diga menos)
  const min = Math.max(1_000_000, Number(valCfg.min ?? 250_000));
  const max = Number(valCfg.hardCap ?? 200_000_000);
  const linearBase = Number(valCfg.linearBase ?? 250_000);
  const linearPerPoint = Number(valCfg.linearPerPoint ?? 180_000);
  const quadTh = Number(valCfg.quadraticThreshold ?? 20);
  const quadFactor = Number(valCfg.quadraticFactor ?? 50_000);
  const baseDiv = Number(dampCfg.baseDivisor ?? 1);
  const perPeriod = Number(dampCfg.perPeriod ?? 0.1);
  const maxFactor = Number(dampCfg.maxFactor ?? 4);
  const idleThreshold = Number(inactCfg.periodsWithoutGameForDecay ?? 2);
  const idleDecayPer = Number(inactCfg.decayPercentPerExtraPeriod ?? 0.10); // 0.10 => 10%
  const idleDecayMax = Number(inactCfg.maxDecayPercent ?? 0.50); // 50%
    const today = asOf.toISOString().slice(0, 10);
    for (const r of rows) {
      const ap = r.avg_points ?? 0;
      const linear = linearBase + linearPerPoint * ap;
      const quad = ap > quadTh ? quadFactor * Math.pow(ap - quadTh, 2) : 0;
  let raw = Math.round(linear + quad);
      // Amortiguación configurable
      let damp = baseDiv + periodsCompleted * perPeriod;
      if (damp > maxFactor) damp = maxFactor;
      raw = Math.round(raw / damp);
      // Penalización por inactividad: calcular periodos idle
      // Buscar último game de ese jugador (rápido usando fpp + game)
      const [lastGameRow] = await this.ds.query(
        `SELECT MAX(g.datetime_utc) AS last_dt
         FROM ${T('fantasy_player_points')} fpp
         JOIN public.game g ON g.id = fpp.game_id
         WHERE fpp.fantasy_league_id = $1 AND fpp.player_id = $2`,
        [fantasyLeagueId, r.player_id],
      );
      let decayFactor = 0;
      if (lastGameRow?.last_dt) {
        // Calcular en qué periodo cayó ese last_dt
        const [periodIdxRow] = await this.ds.query(
          `SELECT COUNT(*)::int AS completed_before
           FROM ${T('fantasy_scoring_period')}
           WHERE fantasy_league_id = $1 AND ends_at <= $2`,
          [fantasyLeagueId, new Date(lastGameRow.last_dt).toISOString()],
        );
        const lastPeriodIndex = Number(periodIdxRow?.completed_before ?? 0); // número de periodos completados hasta esa fecha
        const idle = periodsCompleted - lastPeriodIndex;
        if (idle >= idleThreshold) {
          const extra = idle - idleThreshold + 1;
            const totalDecay = Math.min(extra * idleDecayPer, idleDecayMax);
          decayFactor = totalDecay;
          raw = Math.round(raw * (1 - totalDecay));
        }
      }
      const value = Math.max(min, Math.min(max, raw));
      await this.ds.query(
        `INSERT INTO ${T('fantasy_player_valuation')} (fantasy_league_id, player_id, current_value, last_change, calc_date)
         VALUES ($1, $2, $3::bigint, 0, $4)
         ON CONFLICT (fantasy_league_id, player_id)
         DO UPDATE SET current_value = EXCLUDED.current_value, updated_at = now(), calc_date = EXCLUDED.calc_date`,
        [fantasyLeagueId, r.player_id, value, today],
      );
    }

    // Propagar clause_value a roster slots activos abiertos (valid_to IS NULL) acorde a multiplier de la liga.
    const [league] = await this.ds.query(`SELECT clause_multiplier FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
    const mult = Number(league?.clause_multiplier ?? 1.5);
    await this.ds.query(
      `UPDATE ${T('fantasy_roster_slot')} fr
       SET clause_value = ROUND(v.current_value::numeric * $2)::bigint,
           updated_at = now()
       FROM ${T('fantasy_player_valuation')} v
       WHERE fr.fantasy_league_id = $1
         AND fr.player_id = v.player_id
         AND fr.active = true
         AND fr.valid_to IS NULL`,
      [fantasyLeagueId, mult],
    );

    return { ok: true, updated: rows.length, multiplier: mult };
  }
}