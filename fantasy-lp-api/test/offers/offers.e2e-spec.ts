// test/offers.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { T } from 'src/database/schema.util';
import request from 'supertest';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';

describe('Offers E2E', () => {
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

  it('crear oferta y aceptar', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Offers Liga');

    // Tomamos un jugador de Alice
    const [row] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and active = true limit 1`,
      [aliceTeamId],
    );
    const playerId = Number(row.player_id);

    // Crear oferta B -> A
    const offerRes = await request(app.getHttpServer())
      .post('/fantasy/offers')
      .send({
        fantasyLeagueId: leagueId,
        playerId,
        fromTeamId: bobTeamId,
        toTeamId: aliceTeamId,
        amount: 2_000_000,
      })
      .expect(201);

    const offerId = offerRes.body?.id;

    // Aceptar por el vendedor
    await request(app.getHttpServer())
      .post(`/fantasy/offers/${offerId}/respond`)
      .send({ accept: true })
      .expect(200);

    // Verificar que el jugador ahora está en Bob
    const [owned] = await ds.query(
      `select 1 from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and player_id = $2 and active = true`,
      [bobTeamId, playerId],
    );
    expect(owned).toBeTruthy();
  });

  // Caso negativo de elegibilidad por torneo se elimina con modelo basado en league_id
});
