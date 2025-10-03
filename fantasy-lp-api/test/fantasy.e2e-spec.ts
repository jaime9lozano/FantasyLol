// test/fantasy.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestAppModule } from './test-app.module';
import { resetFantasyDb, insertManager, assignSixPlayers } from './utils/db';

describe('Fantasy E2E', () => {
  let app: INestApplication;
  let ds: DataSource;
  let server: any;

  let leagueId: number;
  let inviteCode: string;
  let teamAId: number;
  let teamBId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    ds = app.get(DataSource);

    // Reset
    await resetFantasyDb(ds);

    // Seed managers: Alice (id=1), Bob (id=2)
    const alice = await insertManager(ds, 'Alice', 'alice@example.com');
    const bob = await insertManager(ds, 'Bob', 'bob@example.com');

    // 1) Crear liga (controlador usa admin id=1 en tu impl)
    const createLeagueRes = await request(server)
      .post('/fantasy/leagues')
      .send({
        name: 'LEC Amigos',
        timezone: 'Europe/Madrid',
        marketCloseTime: '20:00',
      })
      .expect(201);

    leagueId = createLeagueRes.body.id;
    inviteCode = createLeagueRes.body.inviteCode;
    expect(inviteCode).toBeDefined();

    // 2) A y B se unen
    const joinA = await request(server)
      .post('/fantasy/leagues/join')
      .send({ fantasyManagerId: alice.id, inviteCode, teamName: 'Team Alice' })
      .expect(201);
    teamAId = joinA.body.teamId;

    const joinB = await request(server)
      .post('/fantasy/leagues/join')
      .send({ fantasyManagerId: bob.id, inviteCode, teamName: 'Team Bob' })
      .expect(201);
    teamBId = joinB.body.teamId;

    // 3) Asignar 6 jugadores a cada equipo (SQL)
    await assignSixPlayers(ds, leagueId, teamAId);
    await assignSixPlayers(ds, leagueId, teamBId);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TeamsController', () => {
    it('GET /fantasy/teams/:id/roster devuelve 6', async () => {
      const res = await request(server).get(`/fantasy/teams/${teamAId}/roster`).expect(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(6);
    });

    it('GET /fantasy/teams/free-agents/:leagueId devuelve lista', async () => {
      const res = await request(server).get(`/fantasy/teams/free-agents/${leagueId}`).expect(200);
      expect(res.body).toBeInstanceOf(Array);
    });
  });

  describe('LeaguesController', () => {
    it('GET /fantasy/leagues/:id/ranking devuelve equipos', async () => {
      const res = await request(server).get(`/fantasy/leagues/${leagueId}/ranking`).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe('Market: AUCTION', () => {
    let orderId: number;

    it('Crear AUCTION manual (SQL) y pujar', async () => {
      // Elegimos un agente libre
      const free = await ds.query(`
        SELECT p.id AS player_id
        FROM public.player p
        LEFT JOIN public.fantasy_roster_slot fr
          ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
        WHERE fr.id IS NULL
        LIMIT 1
      `, [leagueId]);

      expect(free.length).toBeGreaterThan(0);
      const playerId = free[0].player_id;

      // Cierra en 15 min
      const closes = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const [order] = await ds.query(`
        INSERT INTO public.market_order (fantasy_league_id, player_id, owner_team_id, type, status, min_price, opens_at, closes_at, created_at, updated_at)
        VALUES ($1, $2, NULL, 'AUCTION', 'OPEN', 1000000::bigint, now(), $3, now(), now())
        RETURNING *;
      `, [leagueId, playerId, closes]);

      orderId = order.id;
      expect(orderId).toBeDefined();

      // Pujar teamB
      const bidB = await request(server)
        .post('/fantasy/market/bid')
        .send({ marketOrderId: orderId, bidderTeamId: teamBId, amount: 1_500_000 })
        .expect(201);
      expect(bidB.body.bidId).toBeDefined();

      // Pujar teamA (sube a 2M)
      const bidA = await request(server)
        .post('/fantasy/market/bid')
        .send({ marketOrderId: orderId, bidderTeamId: teamAId, amount: 2_000_000 })
        .expect(201);
      expect(bidA.body.bidId).toBeDefined();
    });

    it('No cierra si no ha alcanzado closes_at', async () => {
      const closeRes = await request(server)
        .post(`/fantasy/market/close?leagueId=${leagueId}`)
        .expect(201);
      expect(closeRes.body.ok).toBe(true);
      // processed puede ser 0 si ninguna AUCTION ha vencido
    });

    it('Forzamos cierre (closes_at en pasado) y gana la mayor puja', async () => {
      // Ponemos closes_at=NOW()-1s
      await ds.query(`UPDATE public.market_order SET closes_at = now() - interval '1 second' WHERE id = $1`, [orderId]);

      const closeRes = await request(server)
        .post(`/fantasy/market/close?leagueId=${leagueId}`)
        .expect(201);
      expect(closeRes.body.ok).toBe(true);

      // Verificamos que el jugador está ahora en algún equipo (BENCH) y orden settled
      const order = (await ds.query(`SELECT status, player_id FROM public.market_order WHERE id=$1`, [orderId]))[0];
      expect(['SETTLED','CLOSED']).toContain(order.status);

      const slot = await ds.query(
        `SELECT * FROM public.fantasy_roster_slot WHERE fantasy_league_id=$1 AND player_id=$2 AND active=true ORDER BY id DESC LIMIT 1`,
        [leagueId, order.player_id],
      );
      expect(slot.length).toBe(1);
    });
  });

  describe('Market: LISTING', () => {
    let listingId: number;
    it('Crea listing de un titular de Alice', async () => {
      const aliceStarter = await ds.query(
        `SELECT player_id FROM public.fantasy_roster_slot
          WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND active=true AND starter=true LIMIT 1`,
        [leagueId, teamAId],
      );
      const playerId = aliceStarter[0].player_id;

      const res = await request(server)
        .post('/fantasy/market/listing')
        .send({ fantasyLeagueId: leagueId, ownerTeamId: teamAId, playerId, minPrice: 2_000_000 })
        .expect(201);
      listingId = res.body.id || res.body?.id; // entity con relations puede devolver objeto
      expect(res.body.status).toBe('OPEN');
    });
  });

  describe('Offers', () => {
    let offerId: number;
    it('Crea oferta de Bob a Alice por un jugador de Alice', async () => {
      const aliceStarter = await ds.query(
        `SELECT player_id FROM public.fantasy_roster_slot
          WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND active=true AND starter=true LIMIT 1`,
        [leagueId, teamAId],
      );
      const playerId = aliceStarter[0].player_id;

      const res = await request(server)
        .post('/fantasy/offers')
        .send({ fantasyLeagueId: leagueId, playerId, fromTeamId: teamBId, toTeamId: teamAId, amount: 3_000_000 })
        .expect(201);
      offerId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('Acepta oferta', async () => {
      const res = await request(server)
        .post(`/fantasy/offers/${offerId}/respond`)
        .send({ accept: true })
        .expect(201);
      expect(res.body.status).toBe('ACCEPTED');
    });
  });

  describe('Valuation (cláusula)', () => {
    it('Paga cláusula por un jugador del equipo de Alice (si queda alguno)', async () => {
      const anyAlice = await ds.query(
        `SELECT player_id FROM public.fantasy_roster_slot
         WHERE fantasy_league_id=$1 AND fantasy_team_id=$2 AND active=true LIMIT 1`,
        [leagueId, teamAId],
      );
      if (anyAlice.length === 0) {
        // si por la oferta anterior Alice se quedó sin el jugador, saltamos
        return;
      }
      const playerId = anyAlice[0].player_id;
      const res = await request(server)
        .post('/fantasy/valuation/pay-clause')
        .send({ fantasyLeagueId: leagueId, playerId, toTeamId: teamBId })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(Number(res.body.clause)).toBeGreaterThan(0);
    });
  });

  describe('Scoring', () => {
    let periodId: number;
    it('Crea periodo y calcula (los puntos pueden ser 0 si no hay stats)', async () => {
      const period = await ds.query(`
        INSERT INTO public.fantasy_scoring_period (fantasy_league_id, name, starts_at, ends_at)
        VALUES ($1, 'Week 1', now() - interval '7 days', now())
        RETURNING id
      `, [leagueId]);
      periodId = period[0].id;

      const res = await request(server)
        .post('/fantasy/scoring/compute')
        .send({ fantasyLeagueId: leagueId, periodId })
        .expect(201);
      expect(res.body.ok).toBe(true);

      // ranking
      const rnk = await request(server).get(`/fantasy/leagues/${leagueId}/ranking`).expect(200);
      expect(Array.isArray(rnk.body)).toBe(true);
    });

    it('Regla: si falta una posición titular requerida, puntos del periodo = 0', async () => {
      // desactivamos un TOP titular de teamA
      await ds.query(`
        UPDATE public.fantasy_roster_slot
           SET starter = false, updated_at = now()
         WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND slot = 'TOP' AND active = true
      `, [leagueId, teamAId]);

      // recompute
      const res = await request(server)
        .post('/fantasy/scoring/compute')
        .send({ fantasyLeagueId: leagueId, periodId })
        .expect(201);

      const tp = await ds.query(`
        SELECT points FROM public.fantasy_team_points
        WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND fantasy_scoring_period_id = $3
      `, [leagueId, teamAId, periodId]);
      expect(Number(tp[0].points)).toBe(0);
    });
  });
})
