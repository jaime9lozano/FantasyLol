import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('Teams Compact Roster E2E', () => {
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

  it('devuelve un roster compacto ordenado con datos mínimos', async () => {
    const { aliceTeamId } = await createLeagueAndJoin(app, ds, 'Compact Roster');
    const res = await request(app.getHttpServer())
      .get(`/fantasy/teams/${aliceTeamId}/roster/compact`)
      .expect(200);
    const items = res.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(5);
    const first = items[0];
    expect(first).toHaveProperty('slot');
    expect(first).toHaveProperty('starter');
    expect(first).toHaveProperty('player');
    expect(first.player).toHaveProperty('id');
    expect(first.player).toHaveProperty('name');
  });
});
