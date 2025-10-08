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
import { T } from '../../database/schema.util';
import { assertPlayerEligible } from '../leagues/league-pool.util';

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
  ) {}

  private parseTime(t: string): { hh: number; mm: number } {
    const [hh, mm] = t.split(':').map(Number);
    return { hh, mm };
  }

  async createListing(dto: CreateListingDto) {
    // Verifica que el jugador está en ese equipo & liga (usando repositorios → respeta search_path)
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

  // Verificar elegibilidad respecto al torneo activo
  await assertPlayerEligible(this.ds, league.id, dto.playerId, 'createListing');

    const now = new Date();
    const { hh, mm } = this.parseTime(league.marketCloseTime);
    const closes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0));

    const minVal = await this.valuations.findOne({
      where: { fantasyLeague: { id: dto.fantasyLeagueId } as any, player: { id: dto.playerId } as any },
    });
    const minPrice = String(dto.minPrice ?? Number(minVal?.currentValue ?? '0'));

    // Crea orden LISTING (evita duplicadas OPEN por índice parcial)
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
    return this.ds.transaction(async (trx) => {
      // 1) Orden (FOR UPDATE, sin joins)
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
  // Verificar elegibilidad del jugador asociado a la orden (por si cambió el torneo en medio).
  await assertPlayerEligible(this.ds, orderRows[0].fantasy_league_id, orderRows[0].player_id, 'placeBid');

      const order = orderRows[0];
      const leagueId: number = order.fantasy_league_id;
      const closesAt = new Date(order.closes_at);
      if (closesAt <= now) throw new BadRequestException('Orden cerrada');

      // 2) Equipo (FOR UPDATE)
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

      // 3) Top bid
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
      const minRequired = Number(top > minPrice ? top + 1n : minPrice > 0n ? minPrice : 1n);
      if (dto.amount < minRequired) throw new BadRequestException(`Puja mínima: ${minRequired}`);

      // 4) Saldo disponible
      const available = BigInt(team.br) - BigInt(team.bz);
      if (available < BigInt(dto.amount)) throw new BadRequestException('Saldo insuficiente');

      // 5) Reserva incremental (última puja propia)
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
      const extraToReserve = BigInt(dto.amount) > prevAmount ? (BigInt(dto.amount) - prevAmount) : 0n;

      // ⚠️ Importante: enviar String/Number y castear a ::bigint en SQL
      await trx.query(
        `
        UPDATE ${T('fantasy_team')}
        SET budget_reserved = budget_reserved + $1::bigint,
            updated_at = now()
        WHERE id = $2
        `,
        [extraToReserve.toString(), team.id],
      );

      // 6) Inserta la puja (casteando a ::bigint)
      const bidRows = await trx.query(
        `
        INSERT INTO ${T('market_bid')} (market_order_id, bidder_team_id, amount)
        VALUES ($1, $2, $3::bigint)
        RETURNING id, created_at
        `,
        [order.id, team.id, dto.amount.toString()],
      );

      return { bidId: bidRows[0].id, reserved: extraToReserve.toString(), minRequired };
    });
  }

  async closeDailyAuctions(fantasyLeagueId: number, now = new Date()) {
    return this.ds.transaction(async (trx) => {
      // 1) Bloquea órdenes elegibles (vencidas, abiertas, de tipo AUCTION)
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
        // 2) Mayor puja (cast explícito) primero
        const [winner] =
          (await trx.query(
            `
            SELECT bidder_team_id::int AS bidder_team_id, amount::bigint AS amount
            FROM ${T('market_bid')}
            WHERE market_order_id = $1
            ORDER BY amount::bigint DESC, created_at ASC, id ASC
            LIMIT 1
            `,
            [order.id],
          )) ?? [];

        if (!winner) {
          // Sin pujas → cerrar sin transferir
          await trx.query(
            `UPDATE ${T('market_order')}
              SET status = 'CLOSED', closes_at = now(), updated_at = now()
            WHERE id = $1`,
            [order.id],
          );
          continue;
        }

        // 3) Bloquea equipo ganador y comprueba saldo disponible
        const [team] =
          (await trx.query(
            `
            SELECT id::int AS id,
                  budget_remaining::bigint AS br,
                  budget_reserved::bigint  AS bz
            FROM ${T('fantasy_team')}
            WHERE id = $1 AND fantasy_league_id = $2
            FOR UPDATE
            `,
            [winner.bidder_team_id, fantasyLeagueId],
          )) ?? [];

        if (!team) {
          // Equipo no válido → cierra como CLOSED (sin adjudicar)
          await trx.query(
            `UPDATE ${T('market_order')}
              SET status = 'CLOSED', closes_at = now(), updated_at = now()
            WHERE id = $1`,
            [order.id],
          );
          continue;
        }

        const available = BigInt(team.br) - BigInt(team.bz);
        const winAmount = BigInt(winner.amount);
        if (available < winAmount) {
          // Ganador sin saldo suficiente → cierra sin adjudicar (o podrías pasar al siguiente mejor postor)
          await trx.query(
            `UPDATE ${T('market_order')}
              SET status = 'CLOSED', closes_at = now(), updated_at = now()
            WHERE id = $1`,
            [order.id],
          );
          continue;
        }

        // 4) Última puja del ganador (lo reservado que debe liberar tras pagar)
        const [lastWinRow] =
          (await trx.query(
            `
            SELECT amount::bigint AS amount
            FROM ${T('market_bid')}
            WHERE market_order_id = $1
              AND bidder_team_id = $2
            ORDER BY amount::bigint DESC, created_at ASC, id ASC
            LIMIT 1
            `,
            [order.id, team.id],
          )) ?? [];
        const releaseWinner: bigint = lastWinRow?.amount ?? 0n;

        // 5) Descuenta pago y libera su reserva
        await trx.query(
          `
          UPDATE ${T('fantasy_team')}
          SET budget_remaining = budget_remaining - $1::bigint,
              budget_reserved  = budget_reserved  - $2::bigint,
              updated_at = now()
          WHERE id = $3
          `,
          [winAmount.toString(), releaseWinner.toString(), team.id],
        );

        // 6) Libera reservas del resto de postores
        const otherBidders: Array<{ bidder_team_id: number; last_amount: bigint }> = await trx.query(
          `
          SELECT DISTINCT b.bidder_team_id::int AS bidder_team_id,
                (SELECT lb.amount::bigint
                    FROM ${T('market_bid')} lb
                  WHERE lb.market_order_id = b.market_order_id
                    AND lb.bidder_team_id   = b.bidder_team_id
                  ORDER BY lb.amount::bigint DESC, lb.created_at ASC, lb.id ASC
                  LIMIT 1) AS last_amount
          FROM ${T('market_bid')} b
          WHERE b.market_order_id = $1
            AND b.bidder_team_id <> $2
          `,
          [order.id, team.id],
        );

        for (const ob of otherBidders) {
          await trx.query(
            `
            UPDATE ${T('fantasy_team')}
            SET budget_reserved = budget_reserved - COALESCE($1::bigint, 0),
                updated_at = now()
            WHERE id = $2
            `,
            [(ob.last_amount ?? 0n).toString(), ob.bidder_team_id],
          );
        }

        // 7) TRANSFERENCIA:
        //    Desactiva cualquier slot ACTIVO del jugador en la liga (incluido el del owner)
        await trx.query(
          `
          UPDATE ${T('fantasy_roster_slot')}
          SET active = false, updated_at = now()
          WHERE fantasy_league_id = $1
            AND player_id = $2
            AND active = true
          `,
          [fantasyLeagueId, order.player_id],
        );

        //    Inserta/activa slot en el equipo ganador (BENCH, starter=false)
        await trx.query(
          `
          INSERT INTO ${T('fantasy_roster_slot')}
            (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active,
            acquisition_price, clause_value, valid_from, created_at, updated_at)
          VALUES ($1, $2, $3, 'BENCH', false, true,
                  $4::bigint, $4::bigint, now(), now(), now())
          ON CONFLICT (fantasy_league_id, fantasy_team_id, player_id)
          DO UPDATE SET active = true, starter = false, slot = 'BENCH', updated_at = now()
          `,
          [fantasyLeagueId, team.id, order.player_id, winAmount.toString()],
        );

        // 8) Auditoría
        await trx.query(
          `
          INSERT INTO ${T('transfer_transaction')}
            (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type,  executed_at)
          VALUES ($1, $2, $3, $4, $5::bigint, 'AUCTION_WIN', now())
          `,
          [fantasyLeagueId, order.player_id, order.owner_team_id, team.id, winAmount.toString()],
        );

        // 9) Cierra orden con datos de ganador
        await trx.query(
          `
          UPDATE ${T('market_order')}
          SET status = 'CLOSED',
              closes_at = now(),
              updated_at = now()
          WHERE id = $1
          `,
          [order.id],
        );

        settledCount++;
      }

      return { ok: true, processed: orders.length, settled: settledCount };
    });
  }
}