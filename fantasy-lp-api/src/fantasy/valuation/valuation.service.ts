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
        `SELECT id, clause_multiplier, economic_config FROM ${T('fantasy_league')} WHERE id = $1`,
        [dto.fantasyLeagueId],
      );
      if (leagues.length === 0) throw new BadRequestException('Liga no encontrada');
      const league = leagues[0];
      const econCfg = league.economic_config || {};
      const valCfg = econCfg.valuation || {};
  const clauseBoost = Number(valCfg.clauseBoost ?? 1.8);

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

      // Determinar cláusula a pagar: si el slot tiene clause_value (>0), usarlo tal cual.
      // Si no, calcular a partir de valuation actual y multiplicador de la liga.
      let clause: bigint;
      const existingClause = slot.clause_value != null ? BigInt(slot.clause_value) : 0n;
      if (existingClause > 0n) {
        clause = existingClause;
      } else {
        const vals = await trx.query(
          `
          SELECT current_value::bigint AS current_value
          FROM ${T('fantasy_player_valuation')}
          WHERE fantasy_league_id = $1 AND player_id = $2
          `,
          [dto.fantasyLeagueId, dto.playerId],
        );
        const currentValue = vals[0]?.current_value != null ? BigInt(vals[0].current_value) : 0n;
        const mult = Number(league.clause_multiplier ?? 1.5) * clauseBoost;
        clause = (currentValue * BigInt(Math.round(mult * 100))) / 100n;
      }

      // Saldo
      const available = BigInt(buyer.br) - BigInt(buyer.bz);
      if (available < clause) throw new BadRequestException('Saldo insuficiente');

      // Registrar en ledger (delta negativo)
      const newBal = BigInt(buyer.br) - clause;
      if (newBal < 0n) throw new BadRequestException('Saldo insuficiente');
      await trx.query(`UPDATE ${T('fantasy_team')} SET budget_remaining = $3::bigint, updated_at = now() WHERE id = $1 AND fantasy_league_id = $2`, [buyer.id, dto.fantasyLeagueId, newBal.toString()]);
      await trx.query(`INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at) VALUES ($1,$2,'CLAUSE_PAYMENT',-$3::bigint,$4::bigint,NULL,$5::jsonb, now())`, [dto.fantasyLeagueId, buyer.id, clause.toString(), newBal.toString(), JSON.stringify({ playerId: dto.playerId })]);

      // Acreditar al vendedor (ingreso por cláusula)
      const sellers = await trx.query(
        `SELECT id, budget_remaining::bigint AS br
         FROM ${T('fantasy_team')}
         WHERE id = $1 AND fantasy_league_id = $2
         FOR UPDATE`,
        [Number(slot.fantasy_team_id), dto.fantasyLeagueId],
      );
      if (sellers.length) {
        const seller = sellers[0];
        const newSellerBal = (BigInt(seller.br) + clause).toString();
        await trx.query(
          `UPDATE ${T('fantasy_team')} SET budget_remaining = $3::bigint, updated_at = now()
           WHERE id = $1 AND fantasy_league_id = $2`,
          [seller.id, dto.fantasyLeagueId, newSellerBal],
        );
        await trx.query(
          `INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at)
           VALUES ($1,$2,'CLAUSE_INCOME',$3::bigint,$4::bigint,NULL,$5::jsonb, now())`,
          [dto.fantasyLeagueId, seller.id, clause.toString(), newSellerBal, JSON.stringify({ playerId: dto.playerId, fromTeamId: buyer.id })],
        );
      }

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

      // Siempre entra como BENCH y starter=false
      const newSlot = 'BENCH';
      const newStarter = false;

      // Inserta/activa en comprador con UPSERT (si ya estuvo en ese equipo)
      await trx.query(
        `
        INSERT INTO ${T('fantasy_roster_slot')}
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, $6, $7, true, $4::bigint, $4::bigint, $5, now(), now())
        ON CONFLICT (fantasy_league_id, fantasy_team_id, player_id)
        DO UPDATE SET
          active = true,
          slot = 'BENCH',
          starter = false,
          acquisition_price = EXCLUDED.acquisition_price,
          clause_value = EXCLUDED.clause_value,
          valid_from = EXCLUDED.valid_from,
          valid_to = NULL,
          updated_at = now()
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
    // 1) Cargar configuración económica y presupuesto de la liga
    const [econRow] = await this.ds.query(`SELECT economic_config, initial_budget::bigint AS budget FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
    const econ = econRow?.economic_config || {};
    const valCfg = econ.valuation || {};
    const inactCfg = econ.inactivity || {};
    const budget: number = Number(econRow?.budget ?? 100_000_000);

    // Parámetros del modelo power-law y calibración
  const gamma = Number(valCfg.powerGamma ?? 1.5); // curvatura (1=lineal, >1 más caro el élite)
  const topN = Math.max(1, Number(valCfg.topN ?? 5)); // calibración con top N
  const topSpendFactor = Number(valCfg.topSpendFactor ?? 3.0); // sum(topN) ≈ factor * presupuesto
  const pricingMultiplier = Number(valCfg.pricingMultiplier ?? 1.6); // multiplicador global por defecto aún más alto

    // Caps
  const min = Math.max(1_000_000, Number(valCfg.min ?? 1_000_000));
  const max = Number(valCfg.hardCap ?? 400_000_000);

    // Decaimiento por inactividad (por periodos sin jugar)
    const idleThreshold = Number(inactCfg.periodsWithoutGameForDecay ?? 2);
    const idleDecayPer = Number(inactCfg.decayPercentPerExtraPeriod ?? 0.10);
    const idleDecayMax = Number(inactCfg.maxDecayPercent ?? 0.50);

    // 2) Total de puntos por jugador (hasta la fecha) según fantasy_player_points
    const totalsList: Array<{ player_id: number; total_points: number }> = await this.ds.query(
      `SELECT fpp.player_id, COALESCE(SUM(fpp.points)::float,0) AS total_points
       FROM ${T('fantasy_player_points')} fpp
       JOIN public.game g ON g.id = fpp.game_id
       WHERE fpp.fantasy_league_id = $1 AND g.datetime_utc <= $2
       GROUP BY fpp.player_id`,
      [fantasyLeagueId, asOf.toISOString()],
    );
    const totalsMap = new Map<number, number>(totalsList.map(r => [Number(r.player_id), Number(r.total_points)]));

    // 2b) Asegurar que todos los jugadores en roster se incluyan, incluso si no tienen fpp
    const rosterPlayers: Array<{ player_id: number }> = await this.ds.query(
      `SELECT DISTINCT frs.player_id::bigint AS player_id
       FROM ${T('fantasy_roster_slot')} frs
       WHERE frs.fantasy_league_id = $1`,
      [fantasyLeagueId],
    );
    const playerIdsSet = new Set<number>([...totalsMap.keys()]);
    for (const r of rosterPlayers) playerIdsSet.add(Number(r.player_id));

    // 3) Calibrar constante K para que sum(topN) ≈ factor * presupuesto
  const sorted = [...totalsList].sort((a, b) => (b.total_points - a.total_points));
    const top = sorted.slice(0, topN);
    const denom = top.reduce((acc, r) => acc + Math.pow(Math.max(r.total_points, 0), gamma), 0);
    const targetSum = budget * topSpendFactor;
    const K = denom > 0 ? targetSum / denom : 0;

    // 4) Número de periodos completados para medir inactividad
    const [pc] = await this.ds.query(
      `SELECT COUNT(*)::int AS c FROM ${T('fantasy_scoring_period')} WHERE fantasy_league_id = $1 AND ends_at <= $2`,
      [fantasyLeagueId, asOf.toISOString()],
    );
    const periodsCompleted = Number(pc?.c ?? 0);

    // 5) Calcular valor por jugador
    const today = asOf.toISOString().slice(0, 10);
    // Datos para fallback de totales (si un jugador de roster no tiene fpp en esta liga)
    const [lg] = await this.ds.query(`SELECT source_league_id, scoring_config FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
    const sourceLeagueId: number | null = lg?.source_league_id ?? null;
    const sCfg = lg?.scoring_config || {};
    const killW = Number(sCfg.kill ?? 3);
    const assistW = Number(sCfg.assist ?? 2);
    const deathW = Number(sCfg.death ?? -1);
    const cs10W = Number(sCfg.cs10 ?? 0.5);
    const winW = Number(sCfg.win ?? 2);
    const codeRow = sourceLeagueId ? await this.ds.query(`SELECT code FROM public.league WHERE id = $1`, [sourceLeagueId]) : [];
    const coreCode: string | null = codeRow?.[0]?.code ?? null;

    for (const playerId of playerIdsSet) {
      // total points por fpp (si existe)
      let tp = Math.max(Number(totalsMap.get(playerId) || 0), 0);
      // fallback si es roster player sin fpp
      if (tp === 0 && rosterPlayers.find(r => Number(r.player_id) === playerId) && coreCode) {
        const [fb] = await this.ds.query(
          `SELECT (
              COALESCE(SUM(pgs.kills),0) * $3 +
              COALESCE(SUM(pgs.assists),0) * $4 +
              COALESCE(SUM(pgs.deaths),0) * $5 +
              COALESCE(SUM(FLOOR(COALESCE(pgs.cs,0)/10.0)),0) * $6 +
              COALESCE(SUM(CASE WHEN pgs.player_win THEN 1 ELSE 0 END),0) * $7
           )::float AS pts
           FROM public.player_game_stats pgs
           JOIN public.game g ON g.id = pgs.game_id
           JOIN public.tournament t ON t.id = g.tournament_id
           WHERE pgs.player_id = $1 AND g.datetime_utc <= $2
             AND (t.league = $8::text OR t.league ILIKE ($8::text) || '%' OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE ($8::text) || '%'))`,
          [playerId, asOf.toISOString(), killW, assistW, deathW, cs10W, winW, coreCode],
        );
        tp = Math.max(Number(fb?.pts ?? 0), 0);
      }
      // si sigue siendo 0 y tampoco hay coreCode, lo dejamos en 0 -> min
  let raw = Math.round(K * Math.pow(tp, gamma));

      // Decaimiento por inactividad
      const [lastGameRow] = await this.ds.query(
        `SELECT MAX(g.datetime_utc) AS last_dt
         FROM ${T('fantasy_player_points')} fpp
         JOIN public.game g ON g.id = fpp.game_id
         WHERE fpp.fantasy_league_id = $1 AND fpp.player_id = $2`,
        [fantasyLeagueId, playerId],
      );
      if (lastGameRow?.last_dt) {
        const [periodIdxRow] = await this.ds.query(
          `SELECT COUNT(*)::int AS completed_before
           FROM ${T('fantasy_scoring_period')}
           WHERE fantasy_league_id = $1 AND ends_at <= $2`,
          [fantasyLeagueId, new Date(lastGameRow.last_dt).toISOString()],
        );
        const lastPeriodIndex = Number(periodIdxRow?.completed_before ?? 0);
        const idle = periodsCompleted - lastPeriodIndex;
        if (idle >= idleThreshold) {
          const extra = idle - idleThreshold + 1;
          const totalDecay = Math.min(extra * idleDecayPer, idleDecayMax);
          raw = Math.round(raw * (1 - totalDecay));
        }
      }

  // Encarecimiento global
  raw = Math.round(raw * pricingMultiplier);
  const value = Math.max(min, Math.min(max, raw));
      await this.ds.query(
        `INSERT INTO ${T('fantasy_player_valuation')} (fantasy_league_id, player_id, current_value, last_change, calc_date)
         VALUES ($1, $2, $3::bigint, 0, $4)
         ON CONFLICT (fantasy_league_id, player_id)
         DO UPDATE SET current_value = EXCLUDED.current_value, updated_at = now(), calc_date = EXCLUDED.calc_date`,
        [fantasyLeagueId, playerId, value, today],
      );
    }

    // Propagar clause_value a roster slots activos abiertos (valid_to IS NULL) acorde a multiplier de la liga.
    const [league] = await this.ds.query(`SELECT clause_multiplier, economic_config FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
    const mult = Number(league?.clause_multiplier ?? 1.5);
    const econCfg2 = league?.economic_config || {};
    const valCfg2 = econCfg2.valuation || {};
  const clauseBoost = Number(valCfg2.clauseBoost ?? 1.8);
    await this.ds.query(
      `UPDATE ${T('fantasy_roster_slot')} fr
       SET clause_value = ROUND(v.current_value::numeric * $2 * $3)::bigint,
           updated_at = now()
       FROM ${T('fantasy_player_valuation')} v
       WHERE fr.fantasy_league_id = $1
         AND fr.player_id = v.player_id
         AND fr.active = true
         AND fr.valid_to IS NULL`,
      [fantasyLeagueId, mult, clauseBoost],
    );

    return { ok: true, updated: playerIdsSet.size, multiplier: mult, clauseBoost, calibration: { gamma, topN, topSpendFactor, pricingMultiplier, targetSum, K } };
  }
}