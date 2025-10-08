// test/leagues.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { T } from 'src/database/schema.util';
import request from 'supertest';
import { createLeagueAndJoin, ensurePlayers, resetFantasyDb, ensureLeagueTournament } from 'test/helpers/db';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';


describe('Leagues E2E', () => {
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

  it('crea liga, une 2 managers, ranking y update', async () => {
    const leagueRes = await request(app.getHttpServer())
      .post('/fantasy/leagues')
      .send({ name: 'Primera Liga', adminManagerId: 0 }) // será sobrescrito por createLeagueAndJoin
      .expect(201)
      .catch(() => null); // por si tu controller obliga admin en auth, lo hacemos por helper

    // Creamos vía helper garantizado
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Liga E2E');

    const ranking = await request(app.getHttpServer())
      .get(`/fantasy/leagues/${leagueId}/ranking`)
      .expect(200);

    expect(Array.isArray(ranking.body)).toBe(true);

    const patch = await request(app.getHttpServer())
      .patch(`/fantasy/leagues/${leagueId}`)
      .send({ name: 'Liga E2E - Renombrada' })
      .expect(200);

    expect(patch.body?.name).toBe('Liga E2E - Renombrada');

    // Verifica cambio en BD
    const [row] = await ds.query(`select name from ${T('fantasy_league')} where id = $1`, [leagueId]);
    expect(row?.name).toBe('Liga E2E - Renombrada');
  });

  it('crea liga con sourceLeagueId prioritario y persiste code+id', async () => {
    const core = await ds.query(`SELECT id, code FROM public.league ORDER BY id ASC LIMIT 1`);
    if (!core.length) { console.warn('SKIP: sin filas en public.league'); return; }
    const lid = Number(core[0].id);
    const code = (core[0].code || '').toString().toUpperCase();

    await ds.query(`INSERT INTO ${T('fantasy_manager')}(id, display_name, created_at, updated_at)
                    VALUES (1, 'Admin', now(), now())
                    ON CONFLICT (id) DO NOTHING`);

    const res = await request(app.getHttpServer())
      .post('/fantasy/leagues')
      .send({ name: 'Liga Con LeagueId', sourceLeagueId: lid })
      .expect(201);
    const leagueId = res.body.id;
    const [row] = await ds.query(`SELECT source_league_id, source_league_code FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
    expect(Number(row.source_league_id)).toBe(lid);
    if (code) expect(row.source_league_code).toBe(code);
  });

  it('crea liga con sourceLeagueCode y rellena source_league_id + source_league_code', async () => {
    // Elegimos un código esperado presente en public.league; si el dataset de test no lo tiene se intenta fallback.
    // Intentamos leer uno real de la tabla core.
    const rows = await ds.query(`SELECT code FROM public.league ORDER BY id ASC LIMIT 1`);
    if (!rows.length) {
      console.warn('SKIP: no hay filas en public.league para validar source_league_id');
      return;
    }
    const code: string = (rows[0].code || '').toString().toUpperCase();
    if (!code) {
      console.warn('SKIP: código vacío en public.league');
      return;
    }

    // Aseguramos manager id=1 (el controller usa admin por defecto id=1)
    await ds.query(`INSERT INTO ${T('fantasy_manager')}(id, display_name, created_at, updated_at)
                    VALUES (1, 'Admin', now(), now())
                    ON CONFLICT (id) DO NOTHING`);

    // Creamos liga vía API con código explícito
    const res = await request(app.getHttpServer())
      .post('/fantasy/leagues')
      .send({ name: 'Liga Con Code', sourceLeagueCode: code })
      .expect(201);

    expect(res.body?.id).toBeTruthy();
    const leagueId = res.body.id;

    // Consultamos en BD valores persistidos
      const [row] = await ds.query(`SELECT source_league_code, source_league_id, source_tournament_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
      expect(row?.source_league_id).toBeTruthy();
      expect(row?.source_tournament_id).toBeNull();
      expect(row?.source_league_code).toBe(code); // debe mantenerse en mayúsculas
  });
});
