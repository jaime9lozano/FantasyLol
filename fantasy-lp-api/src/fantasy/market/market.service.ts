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
      const orders: Array<{ id: number; player_id: number }> = await trx.query(
        `
        SELECT id, player_id
        FROM ${T('market_order')}
        WHERE fantasy_league_id = $1
          AND type = 'AUCTION'
          AND status = 'OPEN'
          AND closes_at <= $2
        ORDER BY closes_at ASC, id
        FOR UPDATE
        `,
        [fantasyLeagueId, now],
      );

      for (const order of orders) {
        const bids: Array<{ bidder_team_id: number; amount: bigint }> = await trx.query(
          `
          SELECT bidder_team_id, amount::bigint AS amount
          FROM ${T('market_bid')}
          WHERE market_order_id = $1
          ORDER BY amount DESC, created_at ASC
          `,
          [order.id],
        );

        if (bids.length === 0) {
          await trx.query(
            `UPDATE ${T('market_order')} SET status='CLOSED', updated_at=now() WHERE id=$1`,
            [order.id],
          );
          continue;
        }

        let settled = false;

        for (const w of bids) {
          // jugador libre?
          const existing = await trx.query(
            `
            SELECT id
            FROM ${T('fantasy_roster_slot')}
            WHERE fantasy_league_id = $1 AND player_id = $2 AND active = true
            FOR UPDATE
            `,
            [fantasyLeagueId, order.player_id],
          );
          if (existing.length > 0) continue;

          // equipo ganador
          const teamRows = await trx.query(
            `
            SELECT id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
            FROM ${T('fantasy_team')}
            WHERE id = $1 AND fantasy_league_id = $2
            FOR UPDATE
            `,
            [w.bidder_team_id, fantasyLeagueId],
          );
          if (teamRows.length === 0) continue;
          const team = teamRows[0];

          const available = BigInt(team.br) - BigInt(team.bz);
          if (available < w.amount) continue;

          // última puja del ganador (para liberar)
          const lastWinner = await trx.query(
            `
            SELECT amount::bigint AS amount
            FROM ${T('market_bid')}
            WHERE market_order_id = $1 AND bidder_team_id = $2
            ORDER BY amount DESC, created_at ASC
            LIMIT 1
            `,
            [order.id, team.id],
          );
          const releaseWinner: bigint = lastWinner[0]?.amount ?? 0n;

          // descuenta remaining y libera su reserva
          await trx.query(
            `
            UPDATE ${T('fantasy_team')}
            SET budget_remaining = budget_remaining - $1::bigint,
                budget_reserved  = budget_reserved  - $2::bigint,
                updated_at = now()
            WHERE id = $3
            `,
            [w.amount.toString(), releaseWinner.toString(), team.id],
          );

          // libera reservas de los otros postores
          const otherBidders: Array<{ bidder_team_id: number; last_amount: bigint }> = await trx.query(
            `
            SELECT DISTINCT b.bidder_team_id,
                   (SELECT lb.amount::bigint
                      FROM ${T('market_bid')} lb
                      WHERE lb.market_order_id = b.market_order_id
                        AND lb.bidder_team_id   = b.bidder_team_id
                      ORDER BY lb.amount DESC, lb.created_at ASC
                      LIMIT 1) AS last_amount
            FROM ${T('market_bid')} b
            WHERE b.market_order_id = $1 AND b.bidder_team_id <> $2
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

          // crea slot (BENCH)
          await trx.query(
            `
            INSERT INTO ${T('fantasy_roster_slot')}
              (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
            VALUES ($1, $2, $3, 'BENCH', false, true, $4::bigint, $4::bigint, now(), now(), now())
            `,
            [fantasyLeagueId, team.id, order.player_id, w.amount.toString()],
          );

          // auditoría y cierre
          await trx.query(
            `
            INSERT INTO ${T('transfer_transaction')}
              (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type)
            VALUES ($1, $2, NULL, $3, $4::bigint, 'AUCTION_WIN')
            `,
            [fantasyLeagueId, order.player_id, team.id, w.amount.toString()],
          );

          await trx.query(
            `UPDATE ${T('market_order')} SET status='SETTLED', updated_at=now() WHERE id=$1`,
            [order.id],
          );

          settled = true;
          break;
        }

        if (!settled) {
          await trx.query(
            `UPDATE ${T('market_order')} SET status='CLOSED', updated_at=now() WHERE id=$1`,
            [order.id],
          );
        }
      }

      return { ok: true, processed: orders.length };
    });
  }
}