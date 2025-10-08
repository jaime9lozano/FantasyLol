import { DataSource } from 'typeorm';
import { T } from '../../database/schema.util';
import { BadRequestException } from '@nestjs/common';

/**
 * Verifica si un jugador pertenece al pool elegible de la liga según su torneo activo.
 * Criterio:
 *  - Si la liga no tiene source_tournament_id -> true (sin restricción todavía).
 *  - Elegible si:
 *      a) Tiene stats en algún game del torneo, o
 *      b) Tiene membership actual en un equipo que haya jugado el torneo.
 */
export async function isPlayerEligibleForLeague(ds: DataSource, leagueId: number, playerId: number): Promise<boolean> {
  // Nueva lógica: usamos source_league_id para abarcar todos los torneos de esa liga.
  // Si no hay source_league_id, no filtramos (compatibilidad hacia atrás).
  const [row] = await ds.query(`SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
  const lid = row?.source_league_id ?? null;
  if (!lid) return true;

  const [elig] = await ds.query(
      `WITH target_code AS (
          SELECT code FROM public.league WHERE id = $1
        ),
        league_tournaments AS (
          SELECT t.id
          FROM public.tournament t, target_code c
          WHERE (
            t.league = c.code
            OR t.league ILIKE c.code || '%'
            OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE c.code || '%')
          )
        ),
      league_games AS (
        SELECT g.id, g.team1_id, g.team2_id
        FROM public.game g
        JOIN league_tournaments lt ON lt.id = g.tournament_id
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
        UNION
        SELECT id AS team_id FROM public.team WHERE league_id = $1
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
      SELECT 1 AS ok FROM eligible_players WHERE player_id = $2 LIMIT 1`,
    [lid, playerId],
  );
  return !!elig?.ok;
}

export async function assertPlayerEligible(ds: DataSource, leagueId: number, playerId: number, context: string) {
  const ok = await isPlayerEligibleForLeague(ds, leagueId, playerId);
  if (!ok) {
    throw new BadRequestException(`Jugador ${playerId} no elegible para liga ${leagueId} (ctx=${context})`);
  }
}