// src/fantasy/market/market.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MarketOrder } from './market-order.entity';
import { MarketBid } from './market-bid.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { FantasyLeague } from '../leagues/fantasy-league.entity';
import { FantasyPlayerValuation } from '../valuation/fantasy-player-valuation.entity';
import { MarketCycle } from './market-cycle.entity';
import { T } from '../../database/schema.util';
import { assertPlayerEligible } from '../leagues/league-pool.util';
import { SellToLeagueDto } from './dto/sell-to-league.dto';
import { MarketGateway } from './market.gateway';

@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(MarketOrder) private orders: Repository<MarketOrder>,
    @InjectRepository(MarketBid) private bids: Repository<MarketBid>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectRepository(FantasyPlayerValuation) private valuations: Repository<FantasyPlayerValuation>,
    @InjectDataSource() private ds: DataSource,
    @InjectRepository(MarketCycle) private cycles: Repository<MarketCycle>,
    private gateway: MarketGateway,
  ) {}

  private parseTime(t: string): { hh: number; mm: number } {
    const [hh, mm] = t.split(':').map(Number);
    return { hh, mm };
  }

  async createListing(dto: CreateListingDto) {
    const slot = await this.roster.findOne({
      where: {
        fantasyLeague: { id: dto.fantasyLeagueId } as any,
        fantasyTeam: { id: dto.ownerTeamId } as any,
        player: { id: dto.playerId } as any,
        active: true,
      },
    });
    if (!slot) throw new BadRequestException('Jugador no pertenece a ese equipo en esta liga');

    const league = await this.leagues.findOne({ where: { id: dto.fantasyLeagueId } });
    if (!league) throw new BadRequestException('Liga inválida');

    await assertPlayerEligible(this.ds, league.id, dto.playerId, 'createListing');

    const now = new Date();
    const { hh, mm } = this.parseTime(league.marketCloseTime);
    const closes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0));

    const minVal = await this.valuations.findOne({
      where: { fantasyLeague: { id: dto.fantasyLeagueId } as any, player: { id: dto.playerId } as any },
    });
    const minPrice = String(dto.minPrice ?? Number(minVal?.currentValue ?? '0'));

    const order = this.orders.create({
      fantasyLeague: league,
      player: { id: dto.playerId } as any,
      ownerTeam: { id: dto.ownerTeamId } as any,
      type: 'LISTING',
      status: 'OPEN',
      minPrice,
      opensAt: now,
      closesAt: closes,
    });
    return this.orders.save(order);
  }

  async placeBid(dto: PlaceBidDto, now = new Date()) {
    const result = await this.ds.transaction(async (trx) => {
      const orderRows = await trx.query(
        `
        SELECT id, fantasy_league_id, player_id, min_price::bigint AS min_price, closes_at, status
        FROM ${T('market_order')}
        WHERE id = $1 AND status = 'OPEN'
        FOR UPDATE
        `,
        [dto.marketOrderId],
      );
      if (orderRows.length === 0) throw new BadRequestException('Orden no disponible');
      await assertPlayerEligible(this.ds, orderRows[0].fantasy_league_id, orderRows[0].player_id, 'placeBid');

      const order = orderRows[0];
      const leagueId: number = order.fantasy_league_id;
      const closesAt = new Date(order.closes_at);
      if (closesAt <= now) throw new BadRequestException('Orden cerrada');

      const teamRows = await trx.query(
        `
        SELECT id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
        FROM ${T('fantasy_team')}
        WHERE id = $1 AND fantasy_league_id = $2
        FOR UPDATE
        `,
        [dto.bidderTeamId, leagueId],
      );
      if (teamRows.length === 0) throw new BadRequestException('Equipo inválido');
      const team = teamRows[0];

      const topBidRows = await trx.query(
        `
        SELECT amount::bigint AS amount
        FROM ${T('market_bid')}
        WHERE market_order_id = $1
        ORDER BY amount DESC, created_at ASC
        LIMIT 1
        `,
        [order.id],
      );
      const top: bigint = topBidRows[0]?.amount ?? 0n;
      const minPrice: bigint = order.min_price ?? 0n;
      // Regla adicional: no permitir pujar por debajo de la valoración actual del jugador
      const [valRow] = await trx.query(
        `SELECT current_value::bigint AS v FROM ${T('fantasy_player_valuation')} WHERE fantasy_league_id=$1 AND player_id=$2`,
        [leagueId, order.player_id],
      );
      const valuationMin: bigint = valRow?.v ?? 0n;
      const computedMin = top > minPrice ? top + 1n : (minPrice > 0n ? minPrice : 1n);
      const minRequired = Number(computedMin > valuationMin ? computedMin : valuationMin > 0n ? valuationMin : 1n);
      if (dto.amount < minRequired) throw new BadRequestException(`Puja mínima: ${minRequired}`);

      const available = BigInt(team.br) - BigInt(team.bz);
      if (available < BigInt(dto.amount)) throw new BadRequestException('Saldo insuficiente');

      const prevRows = await trx.query(
        `
        SELECT amount::bigint AS amount
        FROM ${T('market_bid')}
        WHERE market_order_id = $1 AND bidder_team_id = $2
        ORDER BY amount DESC, created_at ASC
        LIMIT 1
        `,
        [order.id, team.id],
      );
      const prevAmount: bigint = prevRows[0]?.amount ?? 0n;
      const extraToReserve = BigInt(dto.amount) > prevAmount ? BigInt(dto.amount) - prevAmount : 0n;

      await trx.query(
        `
        UPDATE ${T('fantasy_team')}
        SET budget_reserved = budget_reserved + $1::bigint,
            updated_at = now()
        WHERE id = $2
        `,
        [extraToReserve.toString(), team.id],
      );

      const bidRows = await trx.query(
        `
        INSERT INTO ${T('market_bid')} (market_order_id, bidder_team_id, amount)
        VALUES ($1, $2, $3::bigint)
        RETURNING id, created_at
        `,
        [order.id, team.id, dto.amount.toString()],
      );

      return { bidId: bidRows[0].id, reserved: extraToReserve.toString(), minRequired, orderId: order.id, leagueId };
    });
    // Emitir evento WS fuera de la transacción
    try { this.gateway.emitBidPlaced(result.leagueId, { orderId: result.orderId, teamId: Number(dto.bidderTeamId), amount: Number(dto.amount) }); } catch {}
    return { bidId: result.bidId, reserved: result.reserved, minRequired: result.minRequired };
  }

  async closeDailyAuctions(fantasyLeagueId: number, now = new Date()) {
    return this.ds.transaction(async (trx) => {
      const orders: Array<{ id: number; player_id: number; owner_team_id: number }> = await trx.query(
        `
        SELECT id::int AS id, player_id::bigint AS player_id, owner_team_id::int AS owner_team_id
        FROM ${T('market_order')}
        WHERE fantasy_league_id = $1
          AND status = 'OPEN'
          AND UPPER(type) = 'AUCTION'
          AND closes_at <= $2
        ORDER BY closes_at ASC, id
        FOR UPDATE SKIP LOCKED
        `,
        [fantasyLeagueId, now],
      );

      let settledCount = 0;

      for (const order of orders) {
        const topBidders: Array<{ bidder_team_id: number; amount: bigint }> = await trx.query(
          `
          SELECT b.bidder_team_id::int AS bidder_team_id,
                 (
                   SELECT lb.amount::bigint
                   FROM ${T('market_bid')} lb
                   WHERE lb.market_order_id = b.market_order_id AND lb.bidder_team_id = b.bidder_team_id
                   ORDER BY lb.amount::bigint DESC, lb.created_at ASC, lb.id ASC
                   LIMIT 1
                 ) AS amount
          FROM ${T('market_bid')} b
          WHERE b.market_order_id = $1
          GROUP BY b.market_order_id, b.bidder_team_id
          ORDER BY amount DESC NULLS LAST
          `,
          [order.id],
        );

        if (!topBidders.length) {
          await trx.query(`UPDATE ${T('market_order')} SET status='CLOSED', closes_at=now(), updated_at=now() WHERE id=$1`, [order.id]);
          try { this.gateway.emitOrderClosed(fantasyLeagueId, { orderId: order.id }); } catch {}
          continue;
        }

        let awardedTeamId: number | null = null;
        let awardedAmount: bigint = 0n;

        for (const cand of topBidders) {
          const [team] = (await trx.query(
            `SELECT id::int AS id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
             FROM ${T('fantasy_team')}
             WHERE id = $1 AND fantasy_league_id = $2
             FOR UPDATE`,
            [cand.bidder_team_id, fantasyLeagueId],
          )) ?? [];
          if (!team) continue;

          const [cntRow] = await trx.query(
            `SELECT COUNT(*)::int AS c FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id=$1 AND fantasy_team_id=$2 AND active=true`,
            [fantasyLeagueId, team.id],
          );
          if (Number(cntRow?.c ?? 0) >= 6) continue;

          const available = BigInt(team.br) - BigInt(team.bz);
          const winAmount = BigInt(cand.amount ?? 0n);
          if (available < winAmount) continue;

          awardedTeamId = team.id;
          awardedAmount = winAmount;

          // Descuenta pago y libera su reserva (equivalente a su top bid)
          await trx.query(
            `UPDATE ${T('fantasy_team')}
             SET budget_remaining = budget_remaining - $1::bigint,
                 budget_reserved  = budget_reserved  - $2::bigint,
                 updated_at = now()
             WHERE id = $3`,
            [winAmount.toString(), winAmount.toString(), team.id],
          );

          // Ledger AUCTION_WIN
          await trx.query(
            `INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, ref_id, metadata, created_at)
             SELECT $1, $2, 'AUCTION_WIN', -$3::bigint, budget_remaining, $4, $5::jsonb, now()
             FROM ${T('fantasy_team')} WHERE id = $2`,
            [fantasyLeagueId, team.id, winAmount.toString(), order.id, JSON.stringify({ playerId: Number(order.player_id) })],
          );

          // Libera reservas del resto de postores
          const otherBidders: Array<{ bidder_team_id: number; last_amount: bigint }> = await trx.query(
            `SELECT DISTINCT b.bidder_team_id::int AS bidder_team_id,
                    (SELECT lb.amount::bigint FROM ${T('market_bid')} lb
                      WHERE lb.market_order_id = b.market_order_id AND lb.bidder_team_id = b.bidder_team_id
                      ORDER BY lb.amount::bigint DESC, lb.created_at ASC, lb.id ASC LIMIT 1) AS last_amount
             FROM ${T('market_bid')} b
             WHERE b.market_order_id = $1 AND b.bidder_team_id <> $2`,
            [order.id, team.id],
          );
          for (const ob of otherBidders) {
            await trx.query(
              `UPDATE ${T('fantasy_team')} SET budget_reserved = budget_reserved - COALESCE($1::bigint,0), updated_at = now() WHERE id = $2`,
              [(ob.last_amount ?? 0n).toString(), ob.bidder_team_id],
            );
          }

          // Transferencia del jugador
          await trx.query(
            `UPDATE ${T('fantasy_roster_slot')} SET active=false, updated_at=now()
             WHERE fantasy_league_id=$1 AND player_id=$2 AND active=true`,
            [fantasyLeagueId, order.player_id],
          );
          await trx.query(
            `INSERT INTO ${T('fantasy_roster_slot')} (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
             VALUES ($1,$2,$3,'BENCH',false,true,$4::bigint,$4::bigint,now(),now(),now())
             ON CONFLICT (fantasy_league_id, fantasy_team_id, player_id)
             DO UPDATE SET active=true, starter=false, slot='BENCH', updated_at=now()`,
            [fantasyLeagueId, team.id, order.player_id, winAmount.toString()],
          );
          await trx.query(
            `INSERT INTO ${T('transfer_transaction')} (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type, executed_at)
             VALUES ($1,$2,$3,$4,$5::bigint,'AUCTION_WIN',now())`,
            [fantasyLeagueId, order.player_id, order.owner_team_id, team.id, winAmount.toString()],
          );
          await trx.query(`UPDATE ${T('market_order')} SET status='CLOSED', closes_at=now(), updated_at=now() WHERE id=$1`, [order.id]);
          try {
            this.gateway.emitOrderAwarded(fantasyLeagueId, { orderId: order.id, playerId: Number(order.player_id), toTeamId: team.id, amount: Number(winAmount) });
            this.gateway.emitOrderClosed(fantasyLeagueId, { orderId: order.id });
          } catch {}

          settledCount++;
          break;
        }

        if (!awardedTeamId) {
          // Nadie puede: liberar todas reservas y cerrar
          const allBidders: Array<{ bidder_team_id: number; last_amount: bigint }> = await trx.query(
            `SELECT DISTINCT b.bidder_team_id::int AS bidder_team_id,
                    (SELECT lb.amount::bigint FROM ${T('market_bid')} lb
                      WHERE lb.market_order_id = b.market_order_id AND lb.bidder_team_id = b.bidder_team_id
                      ORDER BY lb.amount::bigint DESC, lb.created_at ASC, lb.id ASC LIMIT 1) AS last_amount
             FROM ${T('market_bid')} b
             WHERE b.market_order_id = $1`,
            [order.id],
          );
          for (const ob of allBidders) {
            await trx.query(
              `UPDATE ${T('fantasy_team')} SET budget_reserved = budget_reserved - COALESCE($1::bigint,0), updated_at = now() WHERE id = $2`,
              [(ob.last_amount ?? 0n).toString(), ob.bidder_team_id],
            );
          }
          await trx.query(`UPDATE ${T('market_order')} SET status='CLOSED', closes_at=now(), updated_at=now() WHERE id=$1`, [order.id]);
          try { this.gateway.emitOrderClosed(fantasyLeagueId, { orderId: order.id }); } catch {}
        }
      }

      return { ok: true, processed: orders.length, settled: settledCount };
    });
  }

  async sellToLeague(dto: SellToLeagueDto) {
    return this.ds.transaction(async (trx) => {
      const [slot] = await trx.query(
        `SELECT id FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id=$1 AND fantasy_team_id=$2 AND player_id=$3 AND active=true FOR UPDATE`,
        [dto.fantasyLeagueId, dto.teamId, dto.playerId],
      );
      if (!slot) throw new BadRequestException('El jugador no pertenece a ese equipo');

      const [val] = await trx.query(
        `SELECT current_value::bigint AS v FROM ${T('fantasy_player_valuation')} WHERE fantasy_league_id=$1 AND player_id=$2`,
        [dto.fantasyLeagueId, dto.playerId],
      );
      const amount = BigInt(val?.v ?? 0);

      await trx.query(
        `UPDATE ${T('fantasy_team')} SET budget_remaining = budget_remaining + $1::bigint, updated_at=now() WHERE id=$2 AND fantasy_league_id=$3`,
        [amount.toString(), dto.teamId, dto.fantasyLeagueId],
      );
      await trx.query(
        `INSERT INTO ${T('fantasy_budget_ledger')} (fantasy_league_id, fantasy_team_id, type, delta, balance_after, metadata, created_at)
         SELECT $1, $2, 'SELL_TO_LEAGUE', $3::bigint, budget_remaining, $4::jsonb, now() FROM ${T('fantasy_team')} WHERE id=$2`,
        [dto.fantasyLeagueId, dto.teamId, amount.toString(), JSON.stringify({ playerId: dto.playerId })],
      );

      await trx.query(
        `UPDATE ${T('fantasy_roster_slot')} SET active=false, valid_to=now(), updated_at=now() WHERE id=$1`,
        [slot.id],
      );

      await trx.query(
        `INSERT INTO ${T('transfer_transaction')} (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type, executed_at)
         VALUES ($1, $2, $3, NULL, $4::bigint, 'SELL_TO_LEAGUE', now())`,
        [dto.fantasyLeagueId, dto.playerId, dto.teamId, amount.toString()],
      );

      return { ok: true, amount: amount.toString() };
    });
  }

  async startNewCycle(fantasyLeagueId: number, count = 6, now = new Date()): Promise<{ cycleId: number; playerIds: number[] }> {
    return this.ds.transaction(async (trx) => {
      const [lastCycle] = await trx.query(
        `SELECT id FROM ${T('market_cycle')} WHERE fantasy_league_id = $1 ORDER BY id DESC LIMIT 1`,
        [fantasyLeagueId],
      );
      const lastCycleId: number | null = lastCycle?.id ?? null;
      const lastPlayers: number[] = lastCycleId
        ? (
            await trx.query(`SELECT player_id::bigint AS pid FROM ${T('market_order')} WHERE cycle_id = $1`, [lastCycleId])
          ).map((r: any) => Number(r.pid))
        : [];

      const takenRows = await trx.query(
        `SELECT player_id::bigint AS pid FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id = $1 AND active = true`,
        [fantasyLeagueId],
      );
      const taken = new Set<number>(takenRows.map((r: any) => Number(r.pid)));

      // Excluir también jugadores ya presentes en órdenes de mercado abiertas (cualquier ciclo)
      const openOrderRows = await trx.query(
        `SELECT player_id::bigint AS pid FROM ${T('market_order')} WHERE fantasy_league_id = $1 AND status = 'OPEN'`,
        [fantasyLeagueId],
      );
      for (const r of openOrderRows) taken.add(Number(r.pid));

  const leagueRow = await trx.query(`SELECT source_league_id, market_close_time FROM ${T('fantasy_league')} WHERE id = $1`, [fantasyLeagueId]);
  const sourceLeagueId: number | null = leagueRow[0]?.source_league_id ?? null;
      const candidateRows = await trx.query(
        sourceLeagueId
          ? `SELECT p.id::bigint AS pid
             FROM public.player p
             JOIN public.team_player_membership tpm ON tpm.player_id = p.id AND tpm.is_current = true
             JOIN public.team t ON t.id = tpm.team_id AND t.league_id = $1
             ORDER BY random() LIMIT 500`
          : `SELECT p.id::bigint AS pid FROM public.player p ORDER BY random() LIMIT 500`,
        sourceLeagueId ? [sourceLeagueId] : [],
      );

      const chosen: number[] = [];
      const already = new Set<number>();
      for (const row of candidateRows) {
        const pid = Number(row.pid);
        if (taken.has(pid)) continue;
        if (lastPlayers.includes(pid)) continue;
        if (already.has(pid)) continue;
        already.add(pid);
        chosen.push(pid);
        if (chosen.length >= count) break;
      }
      if (chosen.length < count) {
        for (const row of candidateRows) {
          if (chosen.length >= count) break;
          const pid = Number(row.pid);
          if (taken.has(pid)) continue;
          if (already.has(pid)) continue;
          already.add(pid);
          chosen.push(pid);
        }
      }

      if (chosen.length === 0) throw new BadRequestException('No hay jugadores libres para el mercado');

      for (const pid of chosen) {
        await trx.query(
          `INSERT INTO ${T('fantasy_player_valuation')} (fantasy_league_id, player_id, current_value, last_change, calc_date)
           VALUES ($1, $2, 1000000, 0, now()::date)
           ON CONFLICT DO NOTHING`,
          [fantasyLeagueId, pid],
        );
      }

      // Cierre diario a la hora configurada (UTC) siguiendo market_close_time de la liga
      let closesAt: Date;
      try {
        const mct: string = leagueRow[0]?.market_close_time || '20:00';
        const { hh, mm } = this.parseTime(mct);
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0));
        closesAt = now < today ? today : new Date(today.getTime() + 24 * 3600 * 1000);
      } catch {
        closesAt = new Date(now.getTime() + 24 * 3600 * 1000);
      }

      const cycle = this.cycles.create({
        fantasyLeague: { id: fantasyLeagueId } as any,
        opensAt: now,
        closesAt,
      });
      const saved = await this.cycles.save(cycle);

      for (const pid of chosen) {
        await trx.query(
          `INSERT INTO ${T('market_order')} (fantasy_league_id, player_id, owner_team_id, type, status, min_price, opens_at, closes_at, cycle_id)
           VALUES (
             $1,
             $2,
             NULL,
             'AUCTION',
             'OPEN',
             COALESCE((SELECT current_value::bigint FROM ${T('fantasy_player_valuation')} WHERE fantasy_league_id = $1 AND player_id = $2), 0),
             $3,
             $4,
             $5
           )`,
          [fantasyLeagueId, pid, now, cycle.closesAt, saved.id],
        );
      }
      const payload = { cycleId: saved.id, playerIds: chosen };
      // Emitir evento de nuevo ciclo
      try { this.gateway.emitCycleStarted(fantasyLeagueId, payload); } catch {}
      return payload;
    });
  }

  async settleAndRotate(fantasyLeagueId: number, now = new Date()) {
    await this.closeDailyAuctions(fantasyLeagueId, now);
    const last = await this.cycles.find({ where: { fantasyLeague: { id: fantasyLeagueId } as any }, order: { id: 'DESC' }, take: 1 });
    if (!last.length) return this.startNewCycle(fantasyLeagueId, 6, now);
    const cycle = last[0];
    if (cycle.closesAt <= now) {
      return this.startNewCycle(fantasyLeagueId, 6, now);
    }
    // Si el ciclo sigue abierto pero ya no tiene órdenes OPEN (todas cerradas/canceladas), arrancar uno nuevo
    const [{ cnt }]: Array<{ cnt: number }> = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt FROM ${T('market_order')} WHERE fantasy_league_id = $1 AND cycle_id = $2 AND status = 'OPEN'`,
      [fantasyLeagueId, cycle.id],
    );
    if (Number(cnt || 0) === 0) {
      return this.startNewCycle(fantasyLeagueId, 6, now);
    }
    return { cycleId: cycle.id, playerIds: [] };
  }

  /** Cierra órdenes abiertas para jugadores que ya están en un roster activo de la liga. Libera reservas de todos los pujadores. */
  async cancelOpenOrdersForConflicts(fantasyLeagueId: number) {
    return this.ds.transaction(async (trx) => {
      const orders: Array<{ id: number; player_id: number }> = await trx.query(
        `SELECT mo.id::int AS id, mo.player_id::bigint AS player_id
         FROM ${T('market_order')} mo
         WHERE mo.fantasy_league_id = $1
           AND mo.status = 'OPEN'
           AND EXISTS (
             SELECT 1 FROM ${T('fantasy_roster_slot')} fr
             WHERE fr.fantasy_league_id = $1 AND fr.player_id = mo.player_id AND fr.active = true
           )
         FOR UPDATE SKIP LOCKED`,
        [fantasyLeagueId],
      );

      for (const order of orders) {
        // Libera reservas de todos los pujadores en esta orden
        const bidders: Array<{ bidder_team_id: number; last_amount: bigint }> = await trx.query(
          `SELECT DISTINCT b.bidder_team_id::int AS bidder_team_id,
                  (SELECT lb.amount::bigint FROM ${T('market_bid')} lb
                   WHERE lb.market_order_id = b.market_order_id AND lb.bidder_team_id = b.bidder_team_id
                   ORDER BY lb.amount::bigint DESC, lb.created_at ASC, lb.id ASC LIMIT 1) AS last_amount
           FROM ${T('market_bid')} b
           WHERE b.market_order_id = $1`,
          [order.id],
        );
        for (const ob of bidders) {
          await trx.query(
            `UPDATE ${T('fantasy_team')}
             SET budget_reserved = budget_reserved - COALESCE($1::bigint, 0), updated_at = now()
             WHERE id = $2`,
            [(ob.last_amount ?? 0n).toString(), ob.bidder_team_id],
          );
        }
        await trx.query(`UPDATE ${T('market_order')} SET status='CLOSED', closes_at=now(), updated_at=now() WHERE id=$1`, [order.id]);
        try { this.gateway.emitOrderClosed(fantasyLeagueId, { orderId: order.id }); } catch {}
      }

      return { closed: orders.length };
    });
  }
}