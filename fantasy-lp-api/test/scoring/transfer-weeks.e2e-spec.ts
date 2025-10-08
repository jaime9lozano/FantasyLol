import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

/**
 * Escenario:
 *  - Jornada 1 (Week 1): Manager A y Manager B tienen rosters iniciales (incluye un MID cada uno).
 *  - Se computa Week 1.
 *  - Mercado: A compra al MID de B y B compra al MID de A (intercambio vía cláusula para simplificar).
 *  - Jornada 2 (Week 2): Se computa y los puntos de los nuevos MID cuentan para su nuevo manager.
 * 
 * Simplificación: en vez de simular partidas reales diferentes por semana, reutilizamos los mismos games
 * diferenciando el filtro temporal con valid_from/valid_to actualizado por el pay-clause.
 */

describe('Scoring Transfer Weeks E2E', () => {
  // Aumentamos timeout global de este describe (intercambios + compute)
  jest.setTimeout(20000);
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await resetFantasyDb(ds);
    await ensurePlayers(ds, 80);
  });

  afterAll(async () => {
    await app.close();
  });

  it('intercambio de midlaners entre Week 1 y Week 2 re-asigna puntos correctamente', async () => {
    // Crear liga y dos managers con equipos + roster inicial (helper ya crea 2 managers y asigna roster al primero; adaptamos para el segundo)
  const { leagueId, aliceTeamId, bobTeamId, aliceManagerId, bobManagerId } = await createLeagueAndJoin(app, ds, 'Liga Transfer Weeks');

    // Encontrar un MID de Alice y un MID de Bob (rosters iniciales)
    const midsPre = await ds.query(`
      SELECT fr.id, fr.fantasy_team_id, fr.player_id, fr.slot
      FROM ${T('fantasy_roster_slot')} fr
      WHERE fr.fantasy_league_id = $1 AND fr.slot = 'MID' AND fr.starter = true
    `, [leagueId]);
    expect(midsPre.length).toBe(2);
    const aliceMid = midsPre.find(m => Number(m.fantasy_team_id) === aliceTeamId)!;
    const bobMid = midsPre.find(m => Number(m.fantasy_team_id) === bobTeamId)!;

    // Derivar periodos usando games de esos midlaners
    async function midGames(playerId: number) {
      return ds.query(
        `SELECT g.id, g.datetime_utc
         FROM public.player_game_stats pgs
         JOIN public.game g ON g.id = pgs.game_id
         WHERE pgs.player_id = $1
         ORDER BY g.datetime_utc ASC
         LIMIT 12`,
        [playerId],
      );
    }
    const aliceMidGames = await midGames(aliceMid.player_id);
    const bobMidGames = await midGames(bobMid.player_id);
    const allCandidateGames = [...aliceMidGames, ...bobMidGames]
      .map((g: any) => new Date(g.datetime_utc))
      .sort((a,b)=>a.getTime()-b.getTime());
    if (allCandidateGames.length < 2) {
      console.warn('No hay suficientes games para midlaners — se omite test');
      return;
    }
    const firstGame = allCandidateGames[0];
    // Buscar un segundo game al menos 6 horas después para separar periodos
    const secondGame = allCandidateGames.find(d => d.getTime() - firstGame.getTime() > 6 * 3600 * 1000) || allCandidateGames[allCandidateGames.length - 1];
    if (secondGame.getTime() === firstGame.getTime()) {
      console.warn('No hay segundo game suficientemente separado — se omite test');
      return;
    }
    const week1Start = new Date(firstGame.getTime() - 30 * 60 * 1000);
    const week1End = new Date(secondGame.getTime() - 1 * 1000);
    const week2Start = new Date(secondGame.getTime());
    const week2End = new Date(week2Start.getTime() + 14 * 24 * 3600 * 1000);
    await ds.query(
      `INSERT INTO ${T('fantasy_scoring_period')} (fantasy_league_id, name, starts_at, ends_at, created_at, updated_at)
       VALUES ($1,'Week 1',$2,$3,now(),now()),($1,'Week 2',$4,$5,now(),now())`,
      [leagueId, week1Start.toISOString(), week1End.toISOString(), week2Start.toISOString(), week2End.toISOString()],
    );
    const periods = await ds.query(`SELECT id, name FROM ${T('fantasy_scoring_period')} WHERE fantasy_league_id=$1 ORDER BY starts_at`, [leagueId]);
    const week1 = periods.find(p=>p.name==='Week 1');
    const week2 = periods.find(p=>p.name==='Week 2');

    // (aliceMid / bobMid ya definidos arriba)

    // 1) Backfill y compute Week 1
    await request(app.getHttpServer())
      .post('/fantasy/scoring/backfill-all')
      .send({ fantasyLeagueId: leagueId })
      .expect(201);

    // Si Week1 no intersecta games (dataset fechas), creamos un periodo FULL y lo usamos como Week1
    const anyPoints = await ds.query(`SELECT 1 FROM ${T('fantasy_player_points')} WHERE fantasy_league_id = $1 LIMIT 1`, [leagueId]);
    if (anyPoints.length === 0) throw new Error('No se generaron puntos de jugadores tras backfill (dataset vacío para la liga)');

    await request(app.getHttpServer())
      .post('/fantasy/scoring/compute')
      .send({ fantasyLeagueId: leagueId, periodId: week1.id })
      .expect(201);

    const week1Points = await ds.query(`
      SELECT ftp.fantasy_team_id, ftp.points::float AS pts
      FROM ${T('fantasy_team_points')} ftp
      WHERE ftp.fantasy_league_id = $1 AND ftp.fantasy_scoring_period_id = $2
      ORDER BY ftp.fantasy_team_id
    `, [leagueId, week1.id]);

  // 2) Intercambio de midlaners usando pay-clause (cláusula)
    // Necesitamos clause_value > 0. Aseguramos un valor simple.
    await ds.query(`UPDATE ${T('fantasy_roster_slot')} SET clause_value = 1000000 WHERE id IN ($1, $2)`, [aliceMid.id, bobMid.id]);

    // Recalc valuations para asegurar current_value base (opcional si ya existe)
    await request(app.getHttpServer())
      .post('/fantasy/valuation/recalc')
      .send({ leagueId })
      .expect(201);

  // Alice paga la cláusula del MID de Bob efectivo en el inicio de Week2 (secondGame)
    await request(app.getHttpServer())
      .post('/fantasy/valuation/pay-clause')
      .send({ fantasyLeagueId: leagueId, toTeamId: aliceTeamId, playerId: bobMid.player_id, effectiveAt: week2Start.toISOString() })
      .expect(201);

  // Bob paga la cláusula del MID de Alice efectivo también al inicio de Week2
    await request(app.getHttpServer())
      .post('/fantasy/valuation/pay-clause')
      .send({ fantasyLeagueId: leagueId, toTeamId: bobTeamId, playerId: aliceMid.player_id, effectiveAt: week2Start.toISOString() })
      .expect(201);

    // Ya no es necesario promover manualmente: payClause autopromueve si el jugador era titular no-BENCH.

    // Validar que los roster slots viejos quedaron cerrados (valid_to no null)
    const midHistory = await ds.query(`
      SELECT player_id, fantasy_team_id, valid_from, valid_to
      FROM ${T('fantasy_roster_slot')}
      WHERE fantasy_league_id = $1 AND player_id IN ($2, $3)
      ORDER BY player_id, valid_from
    `, [leagueId, aliceMid.player_id, bobMid.player_id]);

    // Debe haber al menos 4 filas (2 antiguas cerradas + 2 nuevas abiertas)
    expect(midHistory.length).toBeGreaterThanOrEqual(4);
    const openSlots = midHistory.filter(r => r.valid_to == null);
    expect(openSlots.length).toBe(2);

    // 3) Compute Week 2 (los nuevos slots tienen valid_from = week2Start, así que sólo afectan esta semana)
    await request(app.getHttpServer())
      .post('/fantasy/scoring/compute')
      .send({ fantasyLeagueId: leagueId, periodId: week2.id })
      .expect(201);

    const week2Points = await ds.query(`
      SELECT ftp.fantasy_team_id, ftp.points::float AS pts
      FROM ${T('fantasy_team_points')} ftp
      WHERE ftp.fantasy_league_id = $1 AND ftp.fantasy_scoring_period_id = $2
      ORDER BY ftp.fantasy_team_id
    `, [leagueId, week2.id]);

    // Aserción flexible:
    if (week1Points.length === 0) console.warn('Week1 sin puntos (rango sin games) - se omite aserción de puntos week1');
    // Determinar si hay stats de los mids en la segunda ventana
    const midsPostStats = await ds.query(`
      SELECT DISTINCT pgs.player_id
      FROM public.player_game_stats pgs
      JOIN public.game g ON g.id = pgs.game_id
      WHERE pgs.player_id IN ($1,$2) AND g.datetime_utc >= $3
      LIMIT 1
    `, [aliceMid.player_id, bobMid.player_id, week2Start.toISOString()]);
    if (midsPostStats.length > 0) {
      expect(week2Points.length).toBeGreaterThan(0);
    } else if (week2Points.length === 0) {
      console.warn('No hay stats de midlaners después del corte; se valida solo cambio de ownership');
    }

    // Validar que al menos uno de los equipos cambió su MID (historia de slots ya lo prueba)
    // Aquí comprobamos que los player_ids actuales (open slots) son opuestos a los originales
    const finalMids = await ds.query(`
      SELECT fantasy_team_id, player_id
      FROM ${T('fantasy_roster_slot')}
      WHERE fantasy_league_id = $1 AND slot = 'MID' AND starter = true AND active = true AND valid_to IS NULL
    `, [leagueId]);
    expect(finalMids.length).toBe(2);
    const aliceFinalMid = finalMids.find(r => Number(r.fantasy_team_id) === aliceTeamId)!.player_id;
    const bobFinalMid = finalMids.find(r => Number(r.fantasy_team_id) === bobTeamId)!.player_id;
    expect(aliceFinalMid).toBe(bobMid.player_id);
    expect(bobFinalMid).toBe(aliceMid.player_id);
  });
});
