import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { io } from 'socket.io-client';

// Estas pruebas fuerzan ENABLE_AUTH=true via process.env para validar 401/403 y WS join protegido

describe('Auth E2E (ENABLE_AUTH=true)', () => {
  let app: INestApplication; let ds: DataSource; let serverUrl: string;
  const prevEnableAuth = process.env.ENABLE_AUTH;

  beforeAll(async () => {
    process.env.ENABLE_AUTH = 'true';
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    await app.listen(0);
    ds = app.get(DataSource);
    const addr = app.getHttpServer().address();
    const port = typeof addr === 'string' ? 3000 : addr.port;
    serverUrl = `http://127.0.0.1:${port}`;
    try { (app as any).get(require('../../src/fantasy/market/market.gateway').MarketGateway).bindJoinHandler(); } catch {}
  });

  afterAll(async () => {
    process.env.ENABLE_AUTH = prevEnableAuth;
    await app.close();
  });

  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('bloquea acceso sin token (401/403) a endpoints protegidos', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'Auth Liga');

    await request(app.getHttpServer()).get(`/fantasy/leagues/${leagueId}/summary`).expect(401);

    await request(app.getHttpServer())
      .get(`/fantasy/teams/${aliceTeamId}/roster/compact`)
      .expect(401);
  });

  it('permite acceso con token válido y restringe por pertenencia (403 si liga/equipo no coincide)', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Auth Liga 2');

    // login dev para alice
    const login = await request(app.getHttpServer()).post('/auth/dev-login').send({ userId: 1, teamId: aliceTeamId, leagueId }).expect(201);
    const token = login.body.access_token as string;

    // Acceso permitido a su liga y equipo
    await request(app.getHttpServer())
      .get(`/fantasy/leagues/${leagueId}/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/fantasy/teams/${aliceTeamId}/roster/compact`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Acceso denegado si intenta leer equipo de Bob
    await request(app.getHttpServer())
      .get(`/fantasy/teams/${bobTeamId}/roster/compact`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('WS join.league requiere token cuando ENABLE_AUTH=true', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Auth WS');

    // sin token: no debería recibir eventos
    const socket1 = io(serverUrl, { transports: ['websocket'] });
    const got1 = new Promise(resolve => {
      socket1.on('connect', () => socket1.emit('join.league', { leagueId }));
      socket1.on('market.cycle.started', () => resolve('received'));
    });

    // con token correcto
    const login = await request(app.getHttpServer()).post('/auth/dev-login').send({ userId: 1, leagueId }).expect(201);
    const token = login.body.access_token as string;
    const socket2 = io(serverUrl, { transports: ['websocket'] });
    const got2 = new Promise(resolve => {
      socket2.on('connect', () => socket2.emit('join.league', { leagueId, token }));
      socket2.on('market.cycle.started', () => resolve('received'));
    });

    // disparar evento
    await request(app.getHttpServer())
      .post('/fantasy/market/cycle/start')
      .set('Authorization', `Bearer ${token}`)
      .query({ leagueId })
      .expect(201);

    // el socket con token debe recibir, el sin token no
    const r2 = await Promise.race([got2, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout socket2')), 4000))]);
    expect(r2).toBe('received');

    let r1 = 'none';
    try {
      r1 = await Promise.race([got1, new Promise((res) => setTimeout(() => res('none'), 3000))]) as string;
    } catch { /* ignore */ }
    expect(r1).toBe('none');

    socket1.close(); socket2.close();
  });
});
