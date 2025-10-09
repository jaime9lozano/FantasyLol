// src/fantasy/teams/fantasy-teams.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasyRosterSlot } from './fantasy-roster-slot.entity';
import { MoveLineupDto } from './dto/move-lineup.dto';
import { T } from '../../database/schema.util';

@Injectable()
export class FantasyTeamsService {
  constructor(
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyRosterSlot) private roster: Repository<FantasyRosterSlot>,
    private ds: DataSource,
  ) {}

  async getRoster(teamId: number) {
    // Repos/relations respetan search_path => no hace falta prefijar schema
    return this.roster.find({
      where: { fantasyTeam: { id: teamId } as any, active: true },
      relations: ['player'],
    });
  }

  async getCompactRoster(teamId: number) {
    // Datos mínimos para la home: slots ordenados, jugador, starter, valores y bloqueos
    const rows = await this.ds.query(
      `SELECT frs.id,
              frs.slot,
              frs.starter,
              frs.locked_until,
              p.id AS player_id,
              p.display_name AS player_name,
              COALESCE(fpv.current_value, 0)::bigint AS value
       FROM ${T('fantasy_roster_slot')} frs
       JOIN public.player p ON p.id = frs.player_id
       LEFT JOIN ${T('fantasy_player_valuation')} fpv
              ON fpv.fantasy_league_id = frs.fantasy_league_id AND fpv.player_id = frs.player_id
       WHERE frs.fantasy_team_id = $1 AND frs.active = true
       ORDER BY CASE frs.slot
                  WHEN 'TOP' THEN 1
                  WHEN 'JNG' THEN 2
                  WHEN 'MID' THEN 3
                  WHEN 'ADC' THEN 4
                  WHEN 'SUP' THEN 5
                  ELSE 6
                END,
                frs.starter DESC,
                frs.id ASC`,
      [teamId],
    );
    return rows.map((r: any) => ({
      id: Number(r.id),
      slot: r.slot,
      starter: r.starter,
      lockedUntil: r.locked_until,
      player: { id: Number(r.player_id), name: r.player_name },
      value: Number(r.value),
    }));
  }

  async moveLineup(teamId: number, dto: MoveLineupDto) {
    return this.ds.transaction(async (trx) => {
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
    // Si la liga está vinculada a un torneo activo, limitamos el pool a jugadores
    // que tengan (a) stats en games de ese torneo o (b) membership actual en equipos
    // que hayan jugado al menos un game en ese torneo.
    // Fallback: comportamiento previo (todos los libres) si no hay torneo.

    const league = await this.ds.getRepository('fantasy_league' as any).query(
      `SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`,
      [leagueId],
    );
    const coreLeagueId = league[0]?.source_league_id ?? null;

    if (!coreLeagueId) {
      // Fallback original
      return this.ds.query(
        `SELECT p.id AS player_id, p.display_name, COALESCE(fpv.current_value, 0) AS value
         FROM public.player p
         LEFT JOIN ${T('fantasy_roster_slot')} fr
           ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
         LEFT JOIN ${T('fantasy_player_valuation')} fpv
           ON fpv.fantasy_league_id = $1 AND fpv.player_id = p.id
         WHERE fr.id IS NULL
         ORDER BY COALESCE(fpv.current_value, 0) DESC NULLS LAST, p.display_name ASC`,
        [leagueId],
      );
    }

    // Construimos un CTE de jugadores elegibles a nivel de liga (todos los torneos de esa liga).
    // Usamos el code de la liga en tournament.league / league_icon_key (prefijo permitido).
    return this.ds.query(
      `WITH target_code AS (
          SELECT code FROM public.league WHERE id = $2
        ),
        league_tournaments AS (
          SELECT t.id FROM public.tournament t, target_code c
          WHERE (
            t.league = c.code OR t.league ILIKE c.code || '%' OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE c.code || '%')
          )
        ),
        league_games AS (
          SELECT id, team1_id, team2_id FROM public.game WHERE tournament_id IN (SELECT id FROM league_tournaments)
        ),
        players_from_stats AS (
          SELECT DISTINCT pgs.player_id
          FROM public.player_game_stats pgs
          JOIN public.game g ON g.id = pgs.game_id
          WHERE g.id IN (SELECT id FROM league_games)
        ),
        teams_in_league AS (
          SELECT DISTINCT team1_id AS team_id FROM league_games WHERE team1_id IS NOT NULL
          UNION
          SELECT DISTINCT team2_id FROM league_games WHERE team2_id IS NOT NULL
        ),
        players_from_membership AS (
          SELECT DISTINCT tpm.player_id
          FROM public.team_player_membership tpm
          JOIN teams_in_league til ON til.team_id = tpm.team_id
          WHERE tpm.is_current = true
        ),
        eligible_players AS (
          SELECT player_id FROM players_from_stats
          UNION
          SELECT player_id FROM players_from_membership
        )
        SELECT p.id AS player_id,
               p.display_name,
               COALESCE(fpv.current_value, 0) AS value
        FROM public.player p
        JOIN eligible_players ep ON ep.player_id = p.id
        LEFT JOIN ${T('fantasy_roster_slot')} fr
               ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
        LEFT JOIN ${T('fantasy_player_valuation')} fpv
               ON fpv.fantasy_league_id = $1 AND fpv.player_id = p.id
        WHERE fr.id IS NULL
        ORDER BY COALESCE(fpv.current_value, 0) DESC NULLS LAST, p.display_name ASC` ,
      [leagueId, coreLeagueId],
    );
  }
}