import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';

describe('Ledger E2E', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('lista ledger con paginación y filtros básicos', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Ledger Liga');

    // Forzar un par de movimientos: vender a liga y pagar cláusula
    const [aliceP] = await ds.query(`SELECT player_id FROM test.fantasy_roster_slot WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [aliceTeamId]);
    await request(app.getHttpServer()).post('/fantasy/market/sell-to-league').send({ fantasyLeagueId: leagueId, teamId: aliceTeamId, playerId: Number(aliceP.player_id) }).expect(201);

    const [bobP] = await ds.query(`SELECT player_id FROM test.fantasy_roster_slot WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [bobTeamId]);
    // liberar hueco en alice por si acaso
    const [sellToFree] = await ds.query(`SELECT player_id FROM test.fantasy_roster_slot WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [aliceTeamId]);
    await request(app.getHttpServer()).post('/fantasy/market/sell-to-league').send({ fantasyLeagueId: leagueId, teamId: aliceTeamId, playerId: Number(sellToFree.player_id) }).expect(201);
    await request(app.getHttpServer()).post('/fantasy/valuation/pay-clause').send({ fantasyLeagueId: leagueId, toTeamId: aliceTeamId, playerId: Number(bobP.player_id) }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/fantasy/ledger`)
      .query({ leagueId, page: 1, pageSize: 10 })
      .expect(200);

    expect(Array.isArray(res.body?.items)).toBe(true);
    expect(res.body?.items.length).toBeGreaterThan(0);

    const filtered = await request(app.getHttpServer())
      .get(`/fantasy/ledger`)
      .query({ leagueId, teamId: aliceTeamId, type: 'SELL_TO_LEAGUE', page: 1, pageSize: 5 })
      .expect(200);
    expect(filtered.body?.items.every((it: any) => it.type === 'SELL_TO_LEAGUE' && Number(it.fantasy_team_id) === aliceTeamId)).toBe(true);
  });
});
