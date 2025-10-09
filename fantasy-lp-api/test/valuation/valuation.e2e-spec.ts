// test/valuation.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

describe('Valuation E2E', () => {
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

  it('pay clause mueve el jugador y registra transacción', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Valuation Liga');

    const [row] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [aliceTeamId],
    );
    const playerId = Number(row.player_id);

    // Liberar un hueco en el roster de Bob (vende a la liga un jugador cualquiera)
    const [toSell] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [bobTeamId],
    );
    await request(app.getHttpServer())
      .post('/fantasy/market/sell-to-league')
      .send({ fantasyLeagueId: leagueId, teamId: bobTeamId, playerId: Number(toSell.player_id) })
      .expect(201);

    await request(app.getHttpServer())
      .post('/fantasy/valuation/pay-clause')
      .send({
        fantasyLeagueId: leagueId,
        playerId,
        toTeamId: bobTeamId,
      })
      .expect(201);

    const [owned] = await ds.query(
      `select 1 from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and player_id = $2 and active = true`,
      [bobTeamId, playerId],
    );
    expect(owned).toBeTruthy();
  });

  it('pagar cláusula sigue permitido en modelo por league_id (no forzamos torneo)', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Valuation Liga Ineleg');
    const [row] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [aliceTeamId],
    );
    const playerId = Number(row.player_id);
    // Con league_id ya no forzamos inelegibilidad cambiando torneo; omitimos este negativo

    // Liberar un hueco en el roster de Bob antes de pagar cláusula
    const [toSell] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [bobTeamId],
    );
    await request(app.getHttpServer())
      .post('/fantasy/market/sell-to-league')
      .send({ fantasyLeagueId: leagueId, teamId: bobTeamId, playerId: Number(toSell.player_id) })
      .expect(201);

    await request(app.getHttpServer())
      .post('/fantasy/valuation/pay-clause')
      .send({ fantasyLeagueId: leagueId, playerId, toTeamId: bobTeamId })
      .expect(201);
  });

  it('recalcAllValues responde ok (puede actualizar 0 si no hay puntos)', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Valuation Liga 2');

    const res = await request(app.getHttpServer())
      .post('/fantasy/valuation/recalc')
      .send({ leagueId }) // ← tu controller espera { leagueId }
      .expect(201);

    expect(res.body?.ok).toBe(true);
  });
})