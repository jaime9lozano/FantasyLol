import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

describe('Market Cycle E2E', () => {
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

  it('start cycle -> bids -> settle -> rotate new cycle without immediate repetition', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Cycle Liga');

    // Crear valuations dummy para muchos jugadores libres (ya las genera assignSixPlayers para roster, añadimos extra)
    // No necesario si valuations ya existen; se asume dataset suficiente.

    const startRes = await request(app.getHttpServer())
      .post('/fantasy/market/cycle/start')
      .query({ leagueId })
      .expect(201);
    const firstCycleId = startRes.body.cycleId;
    const players: number[] = startRes.body.playerIds;
    expect(players.length).toBeGreaterThan(0);

  // Vender uno de Bob para liberar cupo
  const [bobSome] = await ds.query(`SELECT player_id FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id=$1 AND active=true LIMIT 1`, [bobTeamId]);
  await request(app.getHttpServer()).post('/fantasy/market/sell-to-league').send({ fantasyLeagueId: leagueId, teamId: bobTeamId, playerId: Number(bobSome.player_id) }).expect(201);

  // Pujar por el primero con Bob
    const target = players[0];
    const [bobBudget] = await ds.query(`SELECT budget_remaining::bigint AS b FROM ${T('fantasy_team')} WHERE id = $1`, [bobTeamId]);
    const amount = Number(bobBudget.b) > 100000 ? 100000 : 50000;
    const orderRow = await ds.query(`SELECT id FROM ${T('market_order')} WHERE cycle_id = $1 AND player_id = $2`, [firstCycleId, target]);
    const orderId = orderRow[0].id;
    await request(app.getHttpServer())
      .post('/fantasy/market/bid')
      .send({ marketOrderId: orderId, bidderTeamId: bobTeamId, amount })
      .expect(201);

    // Forzar expiración de ciclo
    await ds.query(`UPDATE ${T('market_cycle')} SET closes_at = now() - interval '1 second' WHERE id = $1`, [firstCycleId]);
    await ds.query(`UPDATE ${T('market_order')} SET closes_at = now() - interval '1 second' WHERE cycle_id = $1`, [firstCycleId]);

    // Rotar (liquida y abre siguiente)
    const rotateRes = await request(app.getHttpServer())
      .post('/fantasy/market/cycle/rotate')
      .query({ leagueId })
      .expect(201);
    const secondPlayers: number[] = rotateRes.body.playerIds;
    // Si hay suficientes jugadores libres, no debe repetirse inmediatamente el subastado
    if (secondPlayers.length > 0 && secondPlayers.length >= players.length) {
      expect(secondPlayers).not.toContain(target);
    }

    // Verificar que si ganó puja se añadió slot activo a Bob
    const [slot] = await ds.query(
      `SELECT 1 FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND player_id = $3 AND active = true`,
      [leagueId, bobTeamId, target],
    );
    expect(slot).toBeTruthy();
  }, 20000);
});
