// test/helpers/db.ts
import { DataSource } from 'typeorm';
import { T } from 'src/database/schema.util';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

/**
 * TRUNCATE únicamente tablas fantasy (en el schema actual DB_SCHEMA).
 */
export async function resetFantasyDb(ds: DataSource): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    await qr.query(`
      truncate table
        ${T('market_bid')},
        ${T('market_order')},
        ${T('transfer_transaction')},
        ${T('transfer_offer')},
        ${T('fantasy_player_points')},
        ${T('fantasy_team_points')},
        ${T('fantasy_player_valuation')},
        ${T('fantasy_roster_slot')},
        ${T('fantasy_team')},
        ${T('fantasy_manager')},
        ${T('fantasy_league')},
        ${T('fantasy_scoring_period')}
      restart identity cascade
    `);
  } finally {
    await qr.release();
  }
}

/**
 * Verifica que existan al menos 'min' jugadores REALES en public.player
 * con memberships activas en public.team_player_membership.
 * 
 * Si no hay suficientes, lanza un error claro indicando que debes
 * ejecutar tu ingesta de Leaguepedia primero.
 * 
 * NO crea datos fake en public (tablas inmutables de Leaguepedia).
 */
export async function ensurePlayers(ds: DataSource, min = 60): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  
  try {
    // Contar jugadores con memberships activas (datos reales de Leaguepedia)
    const [countRow] = await qr.query(`
      SELECT COUNT(DISTINCT p.id)::int as c
      FROM public.player p
      INNER JOIN public.team_player_membership tpm ON tpm.player_id = p.id
      WHERE tpm.is_current = true
    `);
    
    const count = Number(countRow?.c ?? 0);
    
    if (count < min) {
      throw new Error(
        `❌ Insufficient players in public.player: found ${count}, need ${min}.\n` +
        `   👉 Run your Leaguepedia ingestion script to populate public schema with real data.\n` +
        `   The 'public' schema is read-only in tests and should contain official League data.`
      );
    }
    
    console.log(`✅ Found ${count} players with active memberships in public.player (>= ${min} required)`);
    
  } finally {
    await qr.release();
  }
}

/**
 * Crea 2 managers y devuelve sus IDs.
 */
export async function createManagers(ds: DataSource): Promise<{ aliceId: number; bobId: number }> {
  // Insertamos en test.fantasy_manager con display_name (id entero serial)
  const [a] = await ds.query(
    `insert into ${T('fantasy_manager')} (display_name) values ('Alice') returning id`,
  );
  const [b] = await ds.query(
    `insert into ${T('fantasy_manager')} (display_name) values ('Bob') returning id`,
  );
  return { aliceId: Number(a.id), bobId: Number(b.id) };
}

/**
 * Asigna 6 jugadores al equipo: TOP/JNG/MID/ADC/SUP titulares + 1 BENCH.
 * Deriva el rol desde public.team_player_membership -> public.role.code (no desde public.player).
 * Inserta valuación base en fantasy_player_valuation (ON CONFLICT).
 */
type CoreRole = 'TOP' | 'JNG' | 'MID' | 'ADC' | 'SUP';
type RoleSlot = CoreRole | 'BENCH';

export async function assignSixPlayers(
  ds: DataSource,
  leagueId: number,
  teamId: number,
): Promise<void> {
  await ds.transaction(async (qr) => {
    // Leer source_league_id de la liga para filtrar jugadores de esa liga (si existe)
    const [lg] = await qr.query(`SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
    const sourceLeagueId: number | null = lg?.source_league_id ? Number(lg.source_league_id) : null;
    // 1) Jugadores ya asignados en ESTA liga (para no duplicar entre equipos de la misma liga)
    const taken = await qr.query(
      `
      SELECT player_id::bigint AS player_id
      FROM ${T('fantasy_roster_slot')}
      WHERE fantasy_league_id = $1 AND active = true
      `,
      [leagueId],
    );
    const takenIds = new Set<number>(taken.map((r: any) => Number(r.player_id)));

    // 2) Helper: devuelve candidatos por rol normalizado (TOP/JNG/MID/ADC/SUP),
    //    tomando el rol "principal" del jugador como el más frecuente (modo)
    async function fetchCandidatesByRole(target: CoreRole): Promise<number[]> {
      const rows = await qr.query(
        `
        WITH roles AS (
          SELECT
            p.id::bigint AS id,
            UPPER(
              CASE r.code
                WHEN 'JUNGLE'  THEN 'JNG'
                WHEN 'SUPPORT' THEN 'SUP'
                WHEN 'BOT'     THEN 'ADC'
                WHEN 'BOTTOM'  THEN 'ADC'
                ELSE COALESCE(r.code, 'FLEX')
              END
            ) AS role_norm
          FROM public.player p
          JOIN public.team_player_membership tpm
            ON tpm.player_id = p.id
          ${sourceLeagueId ? 'JOIN public.team t ON t.id = tpm.team_id AND t.league_id = $2' : ''}
          LEFT JOIN public.role r
            ON r.id = tpm.main_role_id
        ),
        agg AS (
          SELECT
            id,
            role_norm,
            COUNT(*) AS c,
            ROW_NUMBER() OVER (
              PARTITION BY id
              ORDER BY COUNT(*) DESC,
                CASE role_norm
                  WHEN 'TOP' THEN 1
                  WHEN 'JNG' THEN 2
                  WHEN 'MID' THEN 3
                  WHEN 'ADC' THEN 4
                  WHEN 'SUP' THEN 5
                  ELSE 6
                END
            ) AS rn
          FROM roles
          GROUP BY id, role_norm
        )
        SELECT id
        FROM agg
        WHERE rn = 1
          AND role_norm = $1
        ORDER BY id ASC
        LIMIT 1000
        `,
        sourceLeagueId ? [target, sourceLeagueId] : [target],
      );
      return rows.map((r: any) => Number(r.id));
    }

    // 3) Elige el primer candidato por rol que no esté ya usado en la liga
    async function pickByRole(target: CoreRole): Promise<number | null> {
      const ids = await fetchCandidatesByRole(target);
      for (const id of ids) {
        if (!takenIds.has(id)) {
          takenIds.add(id);
          return id;
        }
      }
      return null;
    }

    // 4) Fallback: cualquier jugador libre (para bench o si falta alguno por rol)
    async function pickAny(): Promise<number | null> {
      const rows = await qr.query(
        `
        SELECT p.id::bigint AS id
        FROM public.player p
        ${sourceLeagueId ? 'JOIN public.team_player_membership tpm ON tpm.player_id = p.id JOIN public.team t ON t.id = tpm.team_id AND t.league_id = $1' : ''}
        ORDER BY p.id ASC
        LIMIT 2000
        `,
        sourceLeagueId ? [sourceLeagueId] : [],
      );
      for (const r of rows) {
        const id = Number(r.id);
        if (!takenIds.has(id)) {
          takenIds.add(id);
          return id;
        }
      }
      return null;
    }

    // 5) Elegimos 5 titulares por rol (TOP/JNG/MID/ADC/SUP) con fallback
    const desired: CoreRole[] = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const picks: { player_id: number; slot: RoleSlot; starter: boolean }[] = [];

    for (const slot of desired) {
      const picked = (await pickByRole(slot)) ?? (await pickAny());
      if (!picked) {
        throw new Error(`No hay jugadores suficientes para el slot ${slot}`);
      }
      picks.push({ player_id: picked, slot, starter: true });
    }

    // 6) Bench (cualquiera no usado)
    const bench = await pickAny();
    if (!bench) throw new Error('No hay jugador disponible para BENCH');
    picks.push({ player_id: bench, slot: 'BENCH', starter: false });

    // 7) Inserts en fantasy (roster + valuación base). Respetamos columnas y casts.
    for (const p of picks) {
      await qr.query(
        `
        INSERT INTO ${T('fantasy_roster_slot')}
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active,
           acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true,
                (1000000)::bigint, (1500000)::bigint, now(), now(), now())
        `,
        [leagueId, teamId, p.player_id, p.slot, p.starter],
      );

      await qr.query(
        `
        INSERT INTO ${T('fantasy_player_valuation')}
          (fantasy_league_id, player_id, current_value, last_change, calc_date)
        VALUES ($1, $2, (1000000)::bigint, 0, now()::date)
        ON CONFLICT (fantasy_league_id, player_id) DO UPDATE
          SET current_value = EXCLUDED.current_value,
              updated_at    = now(),
              calc_date     = EXCLUDED.calc_date
        `,
        [leagueId, p.player_id],
      );
    }
  });
}

/**
 * Crea liga por API y une 2 managers usando inviteCode (POST /fantasy/leagues/join).
 */
export async function createLeagueAndJoin(
  app: INestApplication,
  ds: DataSource,
  name = 'E2E League',
): Promise<{ leagueId: number; aliceTeamId: number; bobTeamId: number; aliceManagerId: number; bobManagerId: number }> {
  const { aliceId, bobId } = await createManagers(ds);

  const server = app.getHttpServer();
  // Elegimos una core league con suficientes jugadores actuales
  const pref = await ds.query(`
    WITH pref AS (
      SELECT id, code FROM public.league WHERE code IN ('LEC','LCK21','LPL2020')
    ),
    ranked AS (
      SELECT l.id, l.code, COUNT(DISTINCT p.id)::int AS players
      FROM (SELECT * FROM pref UNION SELECT id, code FROM public.league) l
      LEFT JOIN public.team t ON t.league_id = l.id
      LEFT JOIN public.team_player_membership tpm ON tpm.team_id = t.id AND tpm.is_current = true
      LEFT JOIN public.player p ON p.id = tpm.player_id
      GROUP BY l.id, l.code
      ORDER BY (CASE WHEN l.code IN ('LEC','LCK21','LPL2020') THEN 0 ELSE 1 END), players DESC, l.id ASC
    )
    SELECT id FROM ranked LIMIT 1`);
  const coreLg = pref[0] ?? null;
  const leagueRes = await request(server)
    .post('/fantasy/leagues')
    .send({ name, ...(coreLg ? { sourceLeagueId: Number(coreLg.id) } : {}) })
    .expect(201);

  const leagueId: number = leagueRes.body?.id;
  let inviteCode: string | undefined = leagueRes.body?.inviteCode;

  if (!inviteCode) {
    const [row] = await ds.query(
      `select invite_code from ${T('fantasy_league')} where id = $1`,
      [leagueId],
    );
    inviteCode = row?.invite_code;
  }
  if (!inviteCode) throw new Error('No se pudo obtener inviteCode de la liga');

  // Join vía ruta exacta: POST /fantasy/leagues/join
  const joinA = await request(server)
    .post(`/fantasy/leagues/join`)
    .send({ inviteCode, fantasyManagerId: aliceId, teamName: 'Alice Team' })
    .expect(201);
  const joinB = await request(server)
    .post(`/fantasy/leagues/join`)
    .send({ inviteCode, fantasyManagerId: bobId, teamName: 'Bob Team' })
    .expect(201);

  const aliceTeamId: number = joinA.body?.teamId;
  const bobTeamId: number = joinB.body?.teamId;

  await assignSixPlayers(ds, leagueId, aliceTeamId);
  await assignSixPlayers(ds, leagueId, bobTeamId);

  return { leagueId, aliceTeamId, bobTeamId, aliceManagerId: aliceId, bobManagerId: bobId };
}

/**
 * Asegura que la liga tenga un source_tournament_id. Si es null, asigna el primer tournament disponible.
 * Devuelve el tournament_id final o null si no hay torneos en dataset.
 */
export async function ensureLeagueTournament(ds: DataSource, leagueId: number): Promise<number | null> {
  // Leemos la liga completa para saber si ya tiene tournament_id pero sin metadatos
  const [lg] = await ds.query(`
    select source_tournament_id, source_tournament_name, source_tournament_overview, source_tournament_year
    from ${T('fantasy_league')} where id = $1`, [leagueId]);

  let tid: number | null = lg?.source_tournament_id ? Number(lg.source_tournament_id) : null;

  // Si no hay tournament_id asignado elegimos el primero disponible
  if (!tid) {
    const tournaments = await ds.query(`select id from public.tournament order by id asc limit 1`);
    if (!tournaments.length) return null;
    tid = Number(tournaments[0].id);
    await ds.query(`update ${T('fantasy_league')} set source_tournament_id = $2, updated_at = now() where id = $1`, [leagueId, tid]);
  }

  // Poblar metadatos si faltan (o siempre refrescar: decisión ligera → sólo si alguno es null)
  if (!lg?.source_tournament_name || !lg?.source_tournament_overview || !lg?.source_tournament_year) {
    const [trow] = await ds.query(`
      select id, name, overview_page, year, date_start
      from public.tournament where id = $1`, [tid]);
    if (trow) {
      const name: string | null = trow.name || deriveTournamentNameFromOverview(trow.overview_page) || null;
      const overview: string | null = trow.overview_page || null;
      const year: number | null = trow.year || deriveYearFromDateStart(trow.date_start) || null;
      await ds.query(`
        update ${T('fantasy_league')}
        set source_tournament_name = $2,
            source_tournament_overview = $3,
            source_tournament_year = $4,
            updated_at = now()
        where id = $1`, [leagueId, name, overview, year]);
    }
  }
  return tid;
}

// Helpers locales (test-only) para derivar valores si la ingesta no los trae.
function deriveTournamentNameFromOverview(ov: string | null | undefined): string | null {
  if (!ov) return null;
  const parts = ov.split('/').filter(Boolean);
  let base = parts.length ? parts[parts.length - 1] : ov;
  base = base.replace(/_/g, ' ').replace(/\bSeason\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  base = base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return base || null;
}

function deriveYearFromDateStart(dsStr: string | null | undefined): number | null {
  if (!dsStr) return null;
  const d = new Date(dsStr + (dsStr.length === 10 ? 'T00:00:00Z' : ''));
  if (isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/**
 * Busca un torneo existente sin partidas asociadas (COUNT(game)=0).
 * Devuelve null si todos los torneos tienen al menos un game.
 */
export async function findEmptyTournamentId(ds: DataSource): Promise<number | null> {
  const rows = await ds.query(`
    SELECT t.id
    FROM public.tournament t
    LEFT JOIN public.game g ON g.tournament_id = t.id
    GROUP BY t.id
    HAVING COUNT(g.id) = 0
    ORDER BY t.id ASC
    LIMIT 1`);
  return rows.length ? Number(rows[0].id) : null;
}