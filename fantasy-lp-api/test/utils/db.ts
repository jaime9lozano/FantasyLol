// test/utils/db.ts
import { DataSource } from 'typeorm';

export async function resetFantasyDb(ds: DataSource) {
  await ds.query(`
    BEGIN;
    TRUNCATE TABLE
      public.market_bid,
      public.market_order,
      public.transfer_transaction,
      public.transfer_offer,
      public.fantasy_team_points,
      public.fantasy_player_points,
      public.fantasy_player_valuation,
      public.fantasy_roster_slot,
      public.fantasy_scoring_period,
      public.fantasy_team,
      public.fantasy_league,
      public.fantasy_manager
    RESTART IDENTITY CASCADE;
    COMMIT;
  `);
}

export async function insertManager(ds: DataSource, display: string, email: string) {
  const rows = await ds.query(`
    INSERT INTO public.fantasy_manager (display_name, email)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING *;
  `, [display, email]);
  return rows[0];
}

export async function assignSixPlayers(ds: DataSource, leagueId: number, teamId: number) {
  // intenta 6 libres; si no, lanza error claro
  const free: Array<{ player_id: number; role_code: string | null }> = await ds.query(`
    SELECT DISTINCT p.id AS player_id, r.code AS role_code
    FROM public.player p
    LEFT JOIN public.team_player_membership tpm ON tpm.player_id = p.id AND tpm.is_current = true
    LEFT JOIN public.role r ON r.id = tpm.main_role_id
    LEFT JOIN public.fantasy_roster_slot fr ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
    WHERE fr.id IS NULL
    LIMIT 1000
  `, [leagueId]);

  if (free.length < 6) {
    throw new Error(`No hay suficientes agentes libres para asignar 6 (hay ${free.length}).`);
  }

  const required = ['TOP','JNG','MID','ADC','SUP'];
  const roleMap = new Map<number, string>(
    free.map(r => [r.player_id, (r.role_code || '').toUpperCase()])
  );
  const pids = free.map(f => f.player_id);

  const starters: { playerId: number; slot: string }[] = [];
  const needed = new Set(required);

  // asigna por rol natural
  for (const pid of pids) {
    if (starters.length >= 5) break;
    const rc = roleMap.get(pid);
    if (rc && needed.has(rc)) {
      starters.push({ playerId: pid, slot: rc });
      needed.delete(rc);
    }
  }
  // completa faltantes
  for (const rc of Array.from(needed)) {
    const pid = pids.find(id => !starters.some(s => s.playerId === id));
    if (pid) starters.push({ playerId: pid, slot: rc });
  }
  // bench
  const benchPid = pids.find(id => !starters.some(s => s.playerId === id))!;

  // inserta
  for (const s of starters) {
    await ds.query(`
      INSERT INTO public.fantasy_roster_slot
        (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
      VALUES ($1, $2, $3, $4, true, true, 0::bigint, 0::bigint, now(), now(), now())
    `, [leagueId, teamId, s.playerId, s.slot]);
  }
  await ds.query(`
    INSERT INTO public.fantasy_roster_slot
      (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
    VALUES ($1, $2, $3, 'BENCH', false, true, 0::bigint, 0::bigint, now(), now(), now())
  `, [leagueId, teamId, benchPid]);

  // valoración base
  const assigned = [...starters.map(s => s.playerId), benchPid];
  await ds.query(`
    INSERT INTO public.fantasy_player_valuation (fantasy_league_id, player_id, current_value, last_change, calc_date)
    SELECT $1, unnest($2::int[]), 1000000::bigint, 0::bigint, CURRENT_DATE
    ON CONFLICT (fantasy_league_id, player_id) DO NOTHING
  `, [leagueId, assigned]);

  return { starters, bench: benchPid };
}