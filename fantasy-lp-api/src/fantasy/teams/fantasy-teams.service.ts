// src/fantasy/teams/fantasy-teams.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasyRosterSlot } from './fantasy-roster-slot.entity';
import { MoveLineupDto } from './dto/move-lineup.dto';

@Injectable()
export class FantasyTeamsService {
  constructor(
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    private ds: DataSource,
  ) {}

  async getRoster(teamId: number) {
    return this.roster.find({ where: { fantasyTeam: { id: teamId } as any, active: true }, relations: ['player'] });
  }

  async moveLineup(teamId: number, dto: MoveLineupDto) {
    return this.ds.transaction(async trx => {
      const slot = await trx.findOne(FantasyRosterSlot, {
        where: { id: dto.rosterSlotId, fantasyTeam: { id: teamId } as any, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!slot) throw new BadRequestException('Slot no encontrado');

      if (slot.lockedUntil && slot.lockedUntil > new Date()) {
        throw new BadRequestException('Jugador bloqueado por partido en curso');
      }

      slot.slot = dto.slot;
      slot.starter = dto.starter;
      await trx.save(slot);
      return slot;
    });
  }

  async freeAgents(leagueId: number) {
    return this.ds.query(`
      SELECT p.id AS player_id, p.display_name, COALESCE(fpv.current_value, 0) AS value
      FROM public.player p
      LEFT JOIN public.fantasy_roster_slot fr
        ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
      LEFT JOIN public.fantasy_player_valuation fpv
        ON fpv.fantasy_league_id = $1 AND fpv.player_id = p.id
      WHERE fr.id IS NULL
      ORDER BY COALESCE(fpv.current_value, 0) DESC NULLS LAST, p.display_name ASC
    `, [leagueId]);
  }
}