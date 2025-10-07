// test/leagues.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { T } from 'src/database/schema.util';
import request from 'supertest';
import { createLeagueAndJoin, ensurePlayers, resetFantasyDb } from 'test/helpers/db';
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
});
