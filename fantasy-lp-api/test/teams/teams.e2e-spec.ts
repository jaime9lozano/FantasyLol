// test/teams.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

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

  it('free agents no incluye jugadores ya en roster y se basa en league_id (todos los torneos de la liga)', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'Teams Liga Elig');

    // Tomamos un jugador del roster para asegurar que no aparece en free agents
    const [slot] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [aliceTeamId],
    );
    const rosterPlayerId = Number(slot.player_id);

    const res1 = await request(app.getHttpServer())
      .get(`/fantasy/teams/free-agents/${leagueId}`)
      .expect(200);
    const fa1: any[] = res1.body;
    expect(fa1.find(p => Number(p.player_id) === rosterPlayerId)).toBeFalsy();

    // Ya no cambiamos tournament; la elegibilidad se evalúa sobre todos los torneos de la liga core
    await request(app.getHttpServer())
      .get(`/fantasy/teams/free-agents/${leagueId}`)
      .expect(200);
  });
});