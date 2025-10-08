import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

describe('Valuation Snapshot E2E', () => {
  let app: INestApplication; let ds: DataSource;
  jest.setTimeout(15000);
  beforeAll(async () => { const m = await Test.createTestingModule({ imports: [TestAppModule] }).compile(); app = m.createNestApplication(); await app.init(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('devuelve snapshot económico con equipos y topPlayers', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Liga Snapshot');
    await request(app.getHttpServer()).post('/fantasy/scoring/backfill-all').send({ fantasyLeagueId: leagueId }).expect(201);
    await request(app.getHttpServer()).post('/fantasy/valuation/recalc').send({ leagueId }).expect(201);
    const res = await request(app.getHttpServer()).get(`/fantasy/valuation/snapshot/${leagueId}`).expect(200);
    expect(res.body?.ok).toBe(true);
    expect(Array.isArray(res.body?.teams)).toBe(true);
    expect(res.body?.leagueId).toBe(leagueId);
  });
});
