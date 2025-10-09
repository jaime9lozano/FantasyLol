import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { io } from 'socket.io-client';

jest.setTimeout(20000);
import { T } from 'src/database/schema.util';

describe('Market WS Close Auction E2E', () => {
  let app: INestApplication; let ds: DataSource; let serverUrl: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    await app.listen(0);
    ds = app.get(DataSource);
    // Habilitar handler de unión a rooms por liga
    try { (app as any).get(require('../../src/fantasy/market/market.gateway').MarketGateway).bindJoinHandler(); } catch {}
    const addr = app.getHttpServer().address();
    const port = typeof addr === 'string' ? 3000 : addr.port;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('emite market.order.awarded y market.order.closed al cierre de subastas', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'WS Close');
    // Iniciar ciclo de subastas con 1 orden para simplificar
    const start = await request(app.getHttpServer()).post('/fantasy/market/cycle/start').query({ leagueId }).expect(201);
    const cycleId = start.body.cycleId;
    const [ord] = await ds.query(`SELECT id FROM ${T('market_order')} WHERE cycle_id = $1 ORDER BY id ASC LIMIT 1`, [cycleId]);
    const orderId = Number(ord.id);

    // Liberar un hueco en el roster de Alice para que no salte el cap de 6 al adjudicar
    const [slot] = await ds.query(`SELECT player_id FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [aliceTeamId]);
    await request(app.getHttpServer())
      .post('/fantasy/market/sell-to-league')
      .send({ fantasyLeagueId: leagueId, teamId: aliceTeamId, playerId: Number(slot.player_id) })
      .expect(201);

    // Una puja válida
  await request(app.getHttpServer()).post('/fantasy/market/bid').send({ marketOrderId: orderId, bidderTeamId: aliceTeamId, amount: 1000 }).expect(201);

    // Forzamos cierre inmediato de la orden
    await ds.query(`UPDATE ${T('market_order')} SET closes_at = now() - interval '1 second' WHERE id = $1`, [orderId]);

    const socket = io(serverUrl, { transports: ['websocket'] });
    const gotAwarded = new Promise<any>(resolve => {
      socket.on('connect', () => socket.emit('join.league', { leagueId }));
      socket.on('market.order.awarded', (payload) => resolve(payload));
    });
    const gotClosed = new Promise<any>(resolve => {
      socket.on('market.order.closed', (payload) => resolve(payload));
    });

    // Ejecutar cierre
    await request(app.getHttpServer()).post('/fantasy/market/close').query({ leagueId }).expect(200);

  const awarded: any = await Promise.race([gotAwarded, new Promise((_, r) => setTimeout(() => r(new Error('timeout awarded')), 9000))]);
    expect(awarded.orderId).toBe(orderId);
  expect(awarded.toTeamId).toBe(aliceTeamId);
  expect(awarded.amount).toBe(1000);

  const closed: any = await Promise.race([gotClosed, new Promise((_, r) => setTimeout(() => r(new Error('timeout closed')), 9000))]);
    expect(closed.orderId).toBe(orderId);
    socket.close();
  });
});
