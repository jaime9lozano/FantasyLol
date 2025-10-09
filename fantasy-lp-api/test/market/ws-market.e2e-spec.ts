import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { io } from 'socket.io-client';

describe('Market WS E2E', () => {
  let app: INestApplication;
  let ds: DataSource;
  let serverUrl: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
      await app.init();
      // Servir en puerto aleatorio para permitir conexión WS real
      await app.listen(0);
    ds = app.get(DataSource);
    // enlazar join handler del gateway y construir URL del servidor
    try { (app as any).get(require('../../src/fantasy/market/market.gateway').MarketGateway).bindJoinHandler(); } catch {}
    const addr = app.getHttpServer().address();
    const port = typeof addr === 'string' ? 3000 : addr.port;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetFantasyDb(ds);
    await ensurePlayers(ds, 80);
  });

  it('emite market.cycle.started al crear un ciclo', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'WS Liga');
    const socket = io(serverUrl, { transports: ['websocket'] });
    const got = new Promise(resolve => {
      socket.on('connect', () => {
        socket.emit('join.league', { leagueId });
      });
      socket.on('market.cycle.started', (payload) => {
        resolve(payload);
      });
    });

    // usamos el endpoint HTTP existente para iniciar
    const res = await (await import('supertest')).default(app.getHttpServer())
      .post('/fantasy/market/cycle/start')
      .query({ leagueId })
      .expect(201);
    expect(res.body.cycleId).toBeDefined();

    const payload: any = await Promise.race([
      got,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting ws')), 5000)),
    ]);
    expect(payload?.cycleId).toBe(res.body.cycleId);
    socket.close();
  });
});
