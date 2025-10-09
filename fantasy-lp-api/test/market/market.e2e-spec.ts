// test/market.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

describe('Market E2E', () => {
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

  it('listing + bid + close auction', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Market Liga');

    const [p] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and starter = true limit 1`,
      [aliceTeamId],
    );
    const playerId = Number(p.player_id);

    const listingRes = await request(app.getHttpServer())
      .post('/fantasy/market/listing')
      .send({
        fantasyLeagueId: leagueId,
        ownerTeamId: aliceTeamId,
        playerId,
        minPrice: 1_000_000,
      })
      .expect(201);
    const orderId = listingRes.body?.id;

    await ds.query(
      `update ${T('market_order')} set type='AUCTION', closes_at = now() + interval '2 minutes', status='OPEN' where id = $1`,
      [orderId],
    );

    // Vender un jugador de Bob para liberar cupo (máximo 6 jugadores activos)
    const [bobSome] = await ds.query(`select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`, [bobTeamId]);
    await request(app.getHttpServer())
      .post('/fantasy/market/sell-to-league')
      .send({ fantasyLeagueId: leagueId, teamId: bobTeamId, playerId: Number(bobSome.player_id) })
      .expect(201);

    await request(app.getHttpServer())
      .post('/fantasy/market/bid')
      .send({ marketOrderId: orderId, bidderTeamId: bobTeamId, amount: 1_800_000 })
      .expect(201);

    await ds.query(
      `update ${T('market_order')} set closes_at = now() - interval '1 second' where id = $1`,
      [orderId],
    );

    await request(app.getHttpServer())
      .post('/fantasy/market/close')
      .query({ leagueId })
      .expect(200);

    const [owned] = await ds.query(
      `select 1 from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and player_id = $2 and active = true`,
      [bobTeamId, playerId],
    );
    expect(owned).toBeTruthy();
  });

  // El test de inelegibilidad por cambio de torneo ya no aplica con league_id que agrega todos los torneos.
})