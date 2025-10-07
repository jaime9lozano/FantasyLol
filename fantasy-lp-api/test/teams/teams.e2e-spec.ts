// test/teams.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('Teams E2E', () => {
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

  it('get roster, move lineup y free agents', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'Teams Liga');

    const rosterRes = await request(app.getHttpServer())
      .get(`/fantasy/teams/${aliceTeamId}/roster`)
      .expect(200);
    const roster = rosterRes.body;
    expect(Array.isArray(roster)).toBe(true);
    expect(roster.length).toBeGreaterThanOrEqual(6);

    const starter = roster.find((r: any) => r.starter === true) || roster[0];
    const moveRes = await request(app.getHttpServer())
      .post(`/fantasy/teams/${aliceTeamId}/lineup`)
      .send({ rosterSlotId: starter.id, slot: 'BENCH', starter: false })
      .expect(200);
    expect(moveRes.body?.starter).toBe(false);
    expect(moveRes.body?.slot).toBe('BENCH');

    await request(app.getHttpServer())
      .get(`/fantasy/teams/free-agents/${leagueId}`)
      .expect(200);
  });
});