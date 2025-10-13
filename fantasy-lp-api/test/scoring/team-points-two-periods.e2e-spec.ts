import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestAppModule } from 'test/test-app.module';
import { T } from 'src/database/schema.util';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('Team points sum across periods (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetFantasyDb(ds);
    await ensurePlayers(ds, 80);
  });

  it('suma correctamente los puntos de sus titulares en dos jornadas y al añadir una tercera', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'TP Two Periods');

    // Encontrar un torneo válido de la liga core
    const [lg] = await ds.query(`SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
    const coreId = lg?.source_league_id ?? null;
    if (!coreId) {
      console.warn('SKIP: no source_league_id -> no podemos filtrar torneos válidos');
      return;
    }
    const [codeRow] = await ds.query(`SELECT code FROM public.league WHERE id = $1`, [coreId]);
    const code: string = codeRow?.code;
    const [tidRow] = await ds.query(
      `SELECT t.id FROM public.tournament t WHERE (t.league = $1 OR t.league ILIKE $1 || '%' OR (t.league_icon_key IS NOT NULL AND t.league_icon_key ILIKE $1 || '%')) ORDER BY t.id ASC LIMIT 1`,
      [code],
    );
    if (!tidRow) {
      console.warn('SKIP: no hay torneos para la liga core');
      return;
    }
    const tournamentId = Number(tidRow.id);

    // Crear dos periodos de 5 minutos cada uno en el pasado cercano
    const now = new Date();
    const p1Start = new Date(now.getTime() - 15 * 60 * 1000); // -15m
    const p1End = new Date(now.getTime() - 10 * 60 * 1000);   // -10m
    const p2Start = new Date(now.getTime() - 10 * 60 * 1000); // -10m
    const p2End = new Date(now.getTime() - 5 * 60 * 1000);    // -5m

    const [p1] = await ds.query(
      `INSERT INTO ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at, created_at, updated_at)
       VALUES ($1, 'P1', $2, $3, now(), now()) RETURNING id`,
      [leagueId, p1Start.toISOString(), p1End.toISOString()],
    );
    const [p2] = await ds.query(
      `INSERT INTO ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at, created_at, updated_at)
       VALUES ($1, 'P2', $2, $3, now(), now()) RETURNING id`,
      [leagueId, p2Start.toISOString(), p2End.toISOString()],
    );
    const period1 = Number(p1.id);
    const period2 = Number(p2.id);

    // Asegurar que los slots estén vigentes durante ambos periodos (valid_from antes del p1)
    await ds.query(
      `UPDATE ${T('fantasy_roster_slot')} SET valid_from = $1, updated_at = now() WHERE fantasy_league_id = $2 AND fantasy_team_id = $3`,
      [new Date(p1Start.getTime() - 60 * 1000).toISOString(), leagueId, aliceTeamId],
    );

    // Elegir titulares de Alice (TOP,JNG,MID,ADC,SUP)
    const starters: Array<{ player_id: number; slot: string }> = await ds.query(
      `SELECT player_id::bigint AS player_id, slot
       FROM ${T('fantasy_roster_slot')}
       WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND starter = true AND active = true
       ORDER BY slot ASC`,
      [leagueId, aliceTeamId],
    );

    expect(starters.length).toBeGreaterThanOrEqual(5);

    // Pesos de scoring
    const [cfgRow] = await ds.query(`SELECT scoring_config FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
    const cfg = cfgRow?.scoring_config || {};
    const killW = Number(cfg.kill ?? 3);
    const assistW = Number(cfg.assist ?? 2);
    const deathW = Number(cfg.death ?? -1);
    const cs10W = Number(cfg.cs10 ?? 0.5);
    const winW = Number(cfg.win ?? 2);

    // Helper para crear un game válido y stats
    async function insertGameWithStats(dt: Date, playerId: number, pts: number) {
      // forzamos puntos a través de kills para exactitud (kills * killW = pts)
      const kills = Math.max(0, Math.round(pts / killW));
      const [g] = await ds.query(
        `INSERT INTO public.game (leaguepedia_game_id, datetime_utc, tournament_id, tournament_name, overview_page, created_at, updated_at)
         VALUES ($1, $2, $3, 'Test T', 'Test', now(), now()) RETURNING id`,
        ['TP_' + Date.now() + '_' + Math.random().toString(36).slice(2), dt.toISOString(), tournamentId],
      );
      await ds.query(
        `INSERT INTO public.player_game_stats (player_id, game_id, kills, assists, deaths, cs, player_win, created_at, updated_at)
         VALUES ($1, $2, $3, 0, 0, 0, false, now(), now())`,
        [playerId, Number(g.id), kills],
      );
    }

    // Asignar puntos por jugador en P1 y P2
    // Ejemplo: ADC 150+150=300 total; el resto 80+90 por jornada
    const bySlotPoints: Record<string, { p1: number; p2: number }> = {
      ADC: { p1: 150, p2: 150 },
      TOP: { p1: 80, p2: 90 },
      JNG: { p1: 80, p2: 90 },
      MID: { p1: 80, p2: 90 },
      SUP: { p1: 80, p2: 90 },
    };

    for (const s of starters) {
      const slot = (s.slot || '').toUpperCase();
      const plan = bySlotPoints[slot];
      if (!plan) continue; // ignora slots que no estén en el plan (por si hay FLEX)
      await insertGameWithStats(new Date(p1Start.getTime() + 60 * 1000), Number(s.player_id), plan.p1);
      await insertGameWithStats(new Date(p2Start.getTime() + 60 * 1000), Number(s.player_id), plan.p2);
    }

    // Compute P1 y P2
    await request(app.getHttpServer()).post('/fantasy/scoring/compute').send({ fantasyLeagueId: leagueId, periodId: period1 }).expect(201);
    await request(app.getHttpServer()).post('/fantasy/scoring/compute').send({ fantasyLeagueId: leagueId, periodId: period2 }).expect(201);

    // Esperado por jornada
    const teamP1 = 150 + 80 + 80 + 80 + 80; // ADC + TOP + JNG + MID + SUP
    const teamP2 = 150 + 90 + 90 + 90 + 90;

    const [row1] = await ds.query(
      `SELECT points::float AS pts FROM ${T('fantasy_team_points')} WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND fantasy_scoring_period_id = $3`,
      [leagueId, aliceTeamId, period1],
    );
    const [row2] = await ds.query(
      `SELECT points::float AS pts FROM ${T('fantasy_team_points')} WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND fantasy_scoring_period_id = $3`,
      [leagueId, aliceTeamId, period2],
    );
    expect(Math.round(Number(row1?.pts ?? 0))).toBe(teamP1);
    expect(Math.round(Number(row2?.pts ?? 0))).toBe(teamP2);

    // Total del equipo = suma P1+P2
    const [tot] = await ds.query(`SELECT points_total::float AS total FROM ${T('fantasy_team')} WHERE id = $1`, [aliceTeamId]);
    expect(Math.round(Number(tot?.total ?? 0))).toBe(teamP1 + teamP2);

    // Añadir una tercera jornada futura cercana y sumar más puntos
    const p3Start = new Date(now.getTime() - 2 * 60 * 1000); // -2m
    const p3End = new Date(now.getTime() + 3 * 60 * 1000);   // +3m
    const [p3] = await ds.query(
      `INSERT INTO ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at, created_at, updated_at)
       VALUES ($1, 'P3', $2, $3, now(), now()) RETURNING id`,
      [leagueId, p3Start.toISOString(), p3End.toISOString()],
    );
    const period3 = Number(p3.id);

    // Asegurar vigencia también para P3
    await ds.query(
      `UPDATE ${T('fantasy_roster_slot')} SET valid_from = $1, updated_at = now() WHERE fantasy_league_id = $2 AND fantasy_team_id = $3`,
      [new Date(p3Start.getTime() - 60 * 1000).toISOString(), leagueId, aliceTeamId],
    );

    // Asignar más puntos para P3 (ADC 200, resto 60)
    const addP3: Record<string, number> = { ADC: 200, TOP: 60, JNG: 60, MID: 60, SUP: 60 };
    for (const s of starters) {
      const slot = (s.slot || '').toUpperCase();
      const pts = addP3[slot];
      if (!pts) continue;
      await insertGameWithStats(new Date(p3Start.getTime() + 60 * 1000), Number(s.player_id), pts);
    }

    await request(app.getHttpServer()).post('/fantasy/scoring/compute').send({ fantasyLeagueId: leagueId, periodId: period3 }).expect(201);

    const [row3] = await ds.query(
      `SELECT points::float AS pts FROM ${T('fantasy_team_points')} WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND fantasy_scoring_period_id = $3`,
      [leagueId, aliceTeamId, period3],
    );
    const teamP3 = 200 + 60 + 60 + 60 + 60;
    expect(Math.round(Number(row3?.pts ?? 0))).toBe(teamP3);

    const [tot2] = await ds.query(`SELECT points_total::float AS total FROM ${T('fantasy_team')} WHERE id = $1`, [aliceTeamId]);
    expect(Math.round(Number(tot2?.total ?? 0))).toBe(teamP1 + teamP2 + teamP3);
  });
});
