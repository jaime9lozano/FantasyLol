// test/setup-e2e.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  assertSearchPath,
  snapshotPublicFantasyCounts,
  assertPublicFantasyUnchanged,
} from './helpers/db-assert';
import { TestAppModule } from './test-app.module';

let app: INestApplication;
let ds: DataSource;
let baselinePublicFantasy: Record<string, number> = {};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();

  ds = app.get(DataSource);

  const schema = process.env.DB_SCHEMA || 'test';

  // Crea schema test si no existe (idempotente)
  if (schema !== 'public') {
    await ds.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  }

  // Fuerza el search_path de la sesión de test
  await ds.query(`SET search_path = ${schema}, public`);

  await assertSearchPath(ds, schema);

  // Toma baseline de recuentos en public.* (fantasy)
  baselinePublicFantasy = await snapshotPublicFantasyCounts(ds);

  // (Opcional) si quieres empezar “limpio” en test.*:
  // await ds.query(`DO $$ DECLARE r record; BEGIN FOR r IN
  //   SELECT table_name FROM information_schema.tables
  //   WHERE table_schema = '${schema}' LOOP
  //     EXECUTE format('TRUNCATE TABLE "%s"."%s" CASCADE', '${schema}', r.table_name);
  //   END LOOP; END $$;`);
});

afterAll(async () => {
  // Verifica que no cambió nada en public.* (fantasy)
  await assertPublicFantasyUnchanged(ds, baselinePublicFantasy);
  await app?.close();
});