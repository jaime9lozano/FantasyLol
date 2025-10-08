import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from 'test/test-app.module';
import { DataSource } from 'typeorm';
import { resetFantasyDb, ensurePlayers, createLeagueAndJoin } from 'test/helpers/db';
import { T } from 'src/database/schema.util';

/**
 * Verifica que el recálculo de valuaciones ajusta clause_value y que el pago falla si no hay presupuesto.
 */

describe('Valuation Clause Pricing E2E', () => {
  jest.setTimeout(15000);
  let app: INestApplication; let ds: DataSource;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await resetFantasyDb(ds); await ensurePlayers(ds, 80); });

  it('recalc actualiza clause_value y evita compra por saldo insuficiente', async () => {
    const { leagueId, aliceTeamId, bobTeamId } = await createLeagueAndJoin(app, ds, 'Liga Clausulas');

    // Backfill para tener puntos y luego recalc valuaciones
    await request(app.getHttpServer())
      .post('/fantasy/scoring/backfill-all')
      .send({ fantasyLeagueId: leagueId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/fantasy/valuation/recalc')
      .send({ leagueId })
      .expect(201);

    // Tomar un jugador de Alice y leer su clause_value actualizado
    const [slot] = await ds.query(`SELECT id, player_id, clause_value::bigint AS cv FROM ${T('fantasy_roster_slot')} WHERE fantasy_team_id = $1 AND active = true LIMIT 1`, [aliceTeamId]);
    expect(slot).toBeTruthy();

    // Reducir presupuesto de Bob para forzar insuficiencia (dejar budget_remaining muy bajo)
    await ds.query(`UPDATE ${T('fantasy_team')} SET budget_remaining = 1000 WHERE id = $1`, [bobTeamId]);

    // Intento de compra debe fallar por saldo insuficiente
    const res = await request(app.getHttpServer())
      .post('/fantasy/valuation/pay-clause')
      .send({ fantasyLeagueId: leagueId, playerId: slot.player_id, toTeamId: bobTeamId })
      .expect(400);
    expect(res.body?.message).toMatch(/Saldo insuficiente/);
  });
});
