import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('Economic Config E2E', () => {
  jest.setTimeout(15000);
  let app: INestApplication; let ds: DataSource;
  beforeAll(async () => { const m = await Test.createTestingModule({ imports: [TestAppModule] }).compile(); app = m.createNestApplication(); await app.init(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('permite actualizar economic_config y afecta recalc', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Liga Econ');
    // Ajustar dampening para no amortiguar nada
    await request(app.getHttpServer())
      .patch(`/fantasy/leagues/${leagueId}/economic-config`)
      .send({ dampening: { baseDivisor: 1, perPeriod: 0, maxFactor: 1 } })
      .expect(200);

    await request(app.getHttpServer())
      .post('/fantasy/scoring/backfill-all')
      .send({ fantasyLeagueId: leagueId })
      .expect(201);

    const recalc = await request(app.getHttpServer())
      .post('/fantasy/valuation/recalc')
      .send({ leagueId })
      .expect(201);
    expect(recalc.body?.ok).toBe(true);
  });
});
