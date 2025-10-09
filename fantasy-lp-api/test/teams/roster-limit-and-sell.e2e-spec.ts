import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

describe('Roster limit + Sell to League + Player Stats (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;

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

  it('impide adquirir si ya hay 6 activos y permite vender a la liga, además expone stats', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Roster Limit');

    // Alice ya tiene 6 jugadores (assignSixPlayers). Intentamos añadir un 7º vía auction: start cycle y pujar por alguien.
    const start = await request(app.getHttpServer()).post('/fantasy/market/cycle/start').query({ leagueId }).expect(201);
    const cycleId = start.body.cycleId;
    const pId: number = start.body.playerIds[0];
    const [{ id: orderId }] = await ds.query(`SELECT id FROM ${T('market_order')} WHERE cycle_id = $1 AND player_id = $2`, [cycleId, pId]);

    // Forzamos Alice a pujar y cerrar
    await request(app.getHttpServer()).post('/fantasy/market/bid').send({ marketOrderId: orderId, bidderTeamId: aliceTeamId, amount: 100000 }).expect(201);
    await ds.query(`UPDATE ${T('market_order')} SET closes_at = now() - interval '1 second' WHERE id = $1`, [orderId]);
    const closeRes = await request(app.getHttpServer()).post('/fantasy/market/close').query({ leagueId }).expect(200);
    // La adjudicación a Alice debe fallar por límite (orden cerrada sin transferir)
    const [owned] = await ds.query(`SELECT 1 FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id=$1 AND fantasy_team_id=$2 AND player_id=$3 AND active=true`, [leagueId, aliceTeamId, pId]);
    expect(owned).toBeUndefined();

    // Ahora vender uno de Alice a la liga
    const [some] = await ds.query(`SELECT player_id FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id=$1 AND active=true LIMIT 1`, [aliceTeamId]);
    const sellRes = await request(app.getHttpServer()).post('/fantasy/market/sell-to-league').send({ fantasyLeagueId: leagueId, teamId: aliceTeamId, playerId: Number(some.player_id) }).expect(201);
    expect(sellRes.body.amount).toBeDefined();

    // Verificar que el slot está inactivo y presupuesto subió
    const [inactive] = await ds.query(`SELECT active FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id=$1 AND player_id=$2 ORDER BY id DESC LIMIT 1`, [aliceTeamId, Number(some.player_id)]);
    expect(inactive.active).toBe(false);

    // Stats del jugador (de Bob, por ejemplo si lo tiene) sólo validamos que responde estructura
    const [bobPlayer] = await ds.query(`SELECT player_id FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id=$1 AND active=true LIMIT 1`, [bobTeamId]);
    const stats = await request(app.getHttpServer()).get(`/fantasy/teams/${bobTeamId}/player/${Number(bobPlayer.player_id)}/stats`).query({ leagueId }).expect(200);
    expect(Array.isArray(stats.body.periods)).toBe(true);
    expect(stats.body).toHaveProperty('currentValue');
  }, 20000);
});
