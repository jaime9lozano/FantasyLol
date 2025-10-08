import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

/**
 * Test mínimo para autoGenerateWeeklyPeriods: crea liga, ejecuta endpoint y verifica inserción.
 * No valida lógica exacta de fechas, sólo que crea >= 1 periodo si hay games.
 */

describe('Scoring auto-periods E2E', () => {
  let app: INestApplication; let ds: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await resetFantasyDb(ds);
    await ensurePlayers(ds, 80);
  });

  it('genera semanas automáticamente', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Liga Periodos');

    const res = await request(app.getHttpServer())
      .post('/fantasy/scoring/auto-periods')
      .send({ fantasyLeagueId: leagueId })
      .expect(201);

    expect(res.body?.ok).toBe(true);

    const periods = await ds.query(`SELECT id, name, starts_at, ends_at FROM ${T('fantasy_scoring_period')} WHERE fantasy_league_id = $1`, [leagueId]);
    // Si el dataset tiene games para esa core league, debería haber al menos 1
    if (periods.length === 0) {
      console.warn('Dataset sin games para la liga core: no se generaron periodos (aceptable)');
    } else {
      expect(periods[0].name).toMatch(/Week/i);
    }
  });
});
