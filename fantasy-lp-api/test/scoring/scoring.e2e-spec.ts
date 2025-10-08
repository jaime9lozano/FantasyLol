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

  it('ignora stats de juegos fuera de la liga core (filtro por league_id en todos sus torneos)', async () => {
    const { leagueId, aliceTeamId } = await createLeagueAndJoin(app, ds, 'Scoring Torneo');
    // Periodo corto: últimos 3 días
    const [p] = await ds.query(
      `insert into ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at)
       values ($1, 'Periodo Torneo', now() - interval '3 days', now()) returning id`,
      [leagueId],
    );
    const periodId = p.id;

    // Obtener el league_id core de la liga y un torneo de otra liga para insertar stats que deban ignorarse
  const [lrow] = await ds.query(`SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
  const sourceLeagueId = lrow?.source_league_id ?? null;
    if (!sourceLeagueId) {
      console.warn('SKIP: la liga no tiene source_league_id para probar filtro por liga');
      return;
    }
    const other = await ds.query(`
      with code as (select code from public.league where id = $1),
      others as (
        select t.id from public.tournament t, code c
        where not (
          t.league = c.code or t.league ilike c.code || '%' or (t.league_icon_key is not null and t.league_icon_key ilike c.code || '%')
        )
      )
      select id from others limit 1
    `, [sourceLeagueId]);
    if (!other.length) {
      console.warn('SKIP: no existe torneo de otra liga para probar exclusión');
      return;
    }
    const otherTid = other[0].id;

    // Elegir un jugador titular de Alice
    const [slot] = await ds.query(
      `select player_id from ${T('fantasy_roster_slot')} where fantasy_team_id = $1 and starter = true limit 1`,
      [aliceTeamId],
    );
    const playerId = Number(slot.player_id);

    // Insert game en torneo distinto con stats grandes
    const [gBad] = await ds.query(
      `insert into public.game (leaguepedia_game_id, datetime_utc, tournament_id, tournament_name, overview_page, created_at, updated_at)
       values ($1, now() - interval '1 day', $2, 'Other T', 'Other', now(), now()) returning id`,
      ['FAKE_BAD_'+Date.now(), otherTid],
    );
    const badGameId = gBad.id;
    await ds.query(
      `insert into public.player_game_stats (player_id, game_id, kills, assists, deaths, cs, player_win, created_at, updated_at)
       values ($1, $2, 15, 20, 1, 400, true, now(), now())`,
      [playerId, badGameId],
    );

    // Insert game en torneo válido sin stats (o podríamos añadir stats mínimos cero)
    // No insertamos un juego "válido" porque la suite sólo necesita verificar exclusión del otro torneo
    // Compute
    // Sin stats: produce 0 puntos.

    // Compute
    await request(app.getHttpServer())
      .post('/fantasy/scoring/compute')
      .send({ fantasyLeagueId: leagueId, periodId })
      .expect(201);

    // Debe ignorar el juego de otra liga: no se insertan puntos para ese game
    const playerPoints = await ds.query(
      `select points from ${T('fantasy_player_points')} where fantasy_league_id = $1 and player_id = $2 and game_id = $3`,
      [leagueId, playerId, badGameId],
    );
    expect(playerPoints.length).toBe(0); // no se insertó porque se filtró
  });

  it('backfill-all genera puntos de jugadores históricos para la liga', async () => {
    const { leagueId } = await createLeagueAndJoin(app, ds, 'Scoring Backfill');
    // Antes del backfill no debe haber puntos
    const before = await ds.query(`select count(*)::int as c from ${T('fantasy_player_points')} where fantasy_league_id = $1`, [leagueId]);
    const beforeCount = Number(before[0]?.c ?? 0);
    expect(beforeCount).toBe(0);

    const res = await request(app.getHttpServer())
      .post('/fantasy/scoring/backfill-all')
      .send({ fantasyLeagueId: leagueId })
      .expect(201);
    expect(res.body?.ok).toBe(true);
    expect((res.body.inserted ?? 0) + (res.body.updated ?? 0)).toBeGreaterThan(0);

    const after = await ds.query(`select count(*)::int as c from ${T('fantasy_player_points')} where fantasy_league_id = $1`, [leagueId]);
    const afterCount = Number(after[0]?.c ?? 0);
    expect(afterCount).toBeGreaterThan(0);
  });
});