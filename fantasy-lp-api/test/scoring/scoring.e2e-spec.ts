// test/scoring.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { T } from 'src/database/schema.util';
import request from 'supertest';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';

describe('Scoring E2E', () => {
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

  it('computeForPeriod y regla de lineup incompleto = 0', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Scoring Liga');

    // Crear periodo: últimos 7 días
    const [p] = await ds.query(
      `
      insert into ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at)
      values ($1, 'E2E Period', now() - interval '7 days', now())
      returning id
      `,
      [leagueId],
    );
    const periodId = p.id;

    // Asegura lineup incompleto en Bob: desactiva TOP titular
    await ds.query(
      `
      update ${T('fantasy_roster_slot')}
      set starter = false, updated_at = now()
      where fantasy_team_id = $1 and slot = 'TOP' and starter = true and active = true
      `,
      [bobTeamId],
    );

    // Ejecuta compute
    await request(app.getHttpServer())
      .post('/fantasy/scoring/compute')
      .send({ fantasyLeagueId: leagueId, periodId })
      .expect(201);

    // Bob debe tener puntos=0 en el periodo
    const [row] = await ds.query(
      `
      select points from ${T('fantasy_team_points')}
      where fantasy_league_id = $1 and fantasy_team_id = $2 and fantasy_scoring_period_id = $3
      `,
      [leagueId, bobTeamId, periodId],
    );
    expect(Number(row?.points ?? 0)).toBe(0);
  });
});