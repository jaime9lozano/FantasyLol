// src/fantasy/offers/offers.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TransferOffer } from './transfer-offer.entity';
import { TransferTransaction } from './transfer-transaction.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { T } from '../../database/schema.util';
import { assertPlayerEligible } from '../leagues/league-pool.util';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(TransferOffer) private offers: Repository<TransferOffer>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(TransferTransaction) private txrepo: Repository<TransferTransaction>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  async create(dto: CreateOfferDto) {
    // Validar propiedad actual (repos → respeta search_path)
    const slot = await this.roster.findOne({
      where: {
        fantasyLeague: { id: dto.fantasyLeagueId } as any,
        player: { id: dto.playerId } as any,
        fantasyTeam: { id: dto.toTeamId } as any,
        active: true,
      },
    });
    if (!slot) throw new BadRequestException('El jugador no pertenece al equipo objetivo');

    // Verifica elegibilidad (el jugador debe pertenecer al pool del torneo activo de la liga)
    await assertPlayerEligible(this.ds, dto.fantasyLeagueId, dto.playerId, 'offer.create');

    const offer = this.offers.create({
      fantasyLeague: { id: dto.fantasyLeagueId } as any,
      player: { id: dto.playerId } as any,
      fromTeam: { id: dto.fromTeamId } as any,
      toTeam: { id: dto.toTeamId } as any,
      amount: String(dto.amount),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING',
    });
    return this.offers.save(offer);
  }

  async respond(offerId: number, dto: RespondOfferDto) {
    return this.ds.transaction(async (trx) => {
      const offers = await trx.query(
        `
        SELECT id, fantasy_league_id, player_id, from_team_id, to_team_id, amount::bigint AS amount, status, expires_at
        FROM ${T('transfer_offer')}
        WHERE id = $1
        FOR UPDATE
        `,
        [offerId],
      );
      if (offers.length === 0) throw new BadRequestException('Oferta no existe');
      const offer = offers[0];

      if (offer.status !== 'PENDING') throw new BadRequestException('Oferta no está pendiente');

      if (new Date(offer.expires_at) <= new Date()) {
        await trx.query(
          `UPDATE ${T('transfer_offer')} SET status='EXPIRED', updated_at=now() WHERE id=$1`,
          [offerId],
        );
        throw new BadRequestException('Oferta expirada');
      }

      if (!dto.accept) {
        await trx.query(
          `UPDATE ${T('transfer_offer')} SET status='REJECTED', updated_at=now() WHERE id=$1`,
          [offerId],
        );
        return { status: 'REJECTED' };
      }

  // Verifica elegibilidad antes de transferir (por si cambió el torneo en medio)
  await assertPlayerEligible(this.ds, offer.fantasy_league_id, offer.player_id, 'offer.respond');

  // Equipo comprador (bloqueo)
      const buyers = await trx.query(
        `
        SELECT id, budget_remaining::bigint AS br, budget_reserved::bigint AS bz
        FROM ${T('fantasy_team')}
        WHERE id = $1
        FOR UPDATE
        `,
        [offer.from_team_id],
      );
      if (buyers.length === 0) throw new BadRequestException('Equipo comprador inválido');
      const buyer = buyers[0];

      // Slot actual del vendedor (bloqueo)
      const slots = await trx.query(
        `
        SELECT id, locked_until
        FROM ${T('fantasy_roster_slot')}
        WHERE fantasy_league_id = $1 AND player_id = $2 AND fantasy_team_id = $3 AND active = true
        FOR UPDATE
        `,
        [offer.fantasy_league_id, offer.player_id, offer.to_team_id],
      );
      if (slots.length === 0) throw new BadRequestException('El jugador ya no está en el equipo vendedor');
      const slot = slots[0];

      if (slot.locked_until && new Date(slot.locked_until) > new Date()) {
        throw new BadRequestException('Jugador bloqueado por partido en curso');
      }

      // Verifica saldo y descuenta remaining
      const available = BigInt(buyer.br) - BigInt(buyer.bz);
      if (available < BigInt(offer.amount)) throw new BadRequestException('Saldo insuficiente del comprador');

      await trx.query(
        `
        UPDATE ${T('fantasy_team')}
        SET budget_remaining = budget_remaining - $1::bigint,
            updated_at = now()
        WHERE id = $2
        `,
        [offer.amount.toString(), buyer.id],
      );

      // Cierra slot vendedor
      await trx.query(
        `
        UPDATE ${T('fantasy_roster_slot')}
        SET active=false, valid_to=now(), updated_at=now()
        WHERE id = $1
        `,
        [slot.id],
      );

      // Crea nuevo slot en comprador (BENCH)
      await trx.query(
        `
        INSERT INTO ${T('fantasy_roster_slot')}
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, 'BENCH', false, true, $4::bigint, $4::bigint, now(), now(), now())
        `,
        [offer.fantasy_league_id, offer.from_team_id, offer.player_id, offer.amount.toString()],
      );

      // Auditoría
      await trx.query(
        `
        INSERT INTO ${T('transfer_transaction')}
          (fantasy_league_id, player_id, from_team_id, to_team_id, amount, type)
        VALUES ($1, $2, $3, $4, $5::bigint, 'OFFER_ACCEPTED')
        `,
        [offer.fantasy_league_id, offer.player_id, offer.to_team_id, offer.from_team_id, offer.amount.toString()],
      );

      // Marca oferta como aceptada
      await trx.query(
        `UPDATE ${T('transfer_offer')} SET status='ACCEPTED', updated_at=now() WHERE id=$1`,
        [offerId],
      );

      return { status: 'ACCEPTED' };
    });
  }
}