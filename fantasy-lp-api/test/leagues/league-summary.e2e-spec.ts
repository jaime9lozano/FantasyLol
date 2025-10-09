import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('League Summary E2E', () => {
  let app: INestApplication; let ds: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('devuelve ranking top N, info de mercado, próximos cierres, yourTeam y ledger', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'Summary Liga');

    // Generar un movimiento de ledger simple (vender a la liga)
    const [p] = await ds.query(`SELECT player_id FROM test.fantasy_roster_slot WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [aliceTeamId]);
    await request(app.getHttpServer())
      .post('/fantasy/market/sell-to-league')
      .send({ fantasyLeagueId: leagueId, teamId: aliceTeamId, playerId: Number(p.player_id) })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/fantasy/leagues/${leagueId}/summary`)
      .query({ top: 5, teamId: aliceTeamId })
      .expect(200);

    expect(Array.isArray(res.body?.ranking)).toBe(true);
    expect(res.body?.ranking.length).toBeGreaterThan(0);
    expect(res.body?.market).toBeTruthy();
    // Próximos cierres
    expect(Array.isArray(res.body?.market?.nextCloses)).toBe(true);
    // yourTeam
    expect(res.body?.yourTeam?.id).toBe(aliceTeamId);
    expect(Array.isArray(res.body?.ledger)).toBe(true);
  });
});
