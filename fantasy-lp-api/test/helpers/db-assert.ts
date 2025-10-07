// test/helpers/db-assert.ts
import { DataSource } from 'typeorm';

function normalize(sp: string): string {
  return sp.replace(/\s+/g, '').replace(/"/g, '');
}

export async function assertSearchPath(ds: DataSource, expectedFirst: string) {
  const rows = await ds.query(`SELECT current_setting('search_path') AS search_path`);
  const raw = rows?.[0]?.search_path as string | undefined;
  if (!raw) {
    throw new Error('No se pudo leer current_setting(search_path)');
  }
  const normalized = normalize(raw);
  if (!(normalized === expectedFirst || normalized.startsWith(`${expectedFirst},`))) {
    throw new Error(
      `search_path inválido. Obtenido: "${raw}"; esperado empezar por: ${expectedFirst}`,
    );
  }
}

/**
 * Devuelve un snapshot { tabla: count } de las tablas fantasy en public.
 * No falla si las tablas existen; solo medimos baseline para luego comparar.
 */
export async function snapshotPublicFantasyCounts(ds: DataSource): Promise<Record<string, number>> {
  const fantasyTables = [
    'fantasy_manager',
    'fantasy_league',
    'fantasy_team',
    'fantasy_roster_slot',
    'market_order',
    'market_bid',
    'transfer_offer',
    'transfer_transaction',
    'fantasy_scoring_period',
    'fantasy_player_points',
    'fantasy_team_points',
    'fantasy_player_valuation',
  ];

  const counts: Record<string, number> = {};
  for (const t of fantasyTables) {
    // Si la tabla no existe en public, cuenta = 0
    const exists = await ds.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `,
      [t],
    );
    if (!exists.length) {
      counts[t] = 0;
      continue;
    }
    const row = await ds.query(`SELECT COUNT(*)::bigint AS c FROM "public"."${t}"`);
    counts[t] = Number(row[0].c || 0);
  }
  return counts;
}

/**
 * Compara el snapshot inicial con el estado final y falla si cambió algún recuento.
 * Esto garantiza que los tests NO han escrito en public.* (fantasy).
 */
export async function assertPublicFantasyUnchanged(
  ds: DataSource,
  baseline: Record<string, number>,
) {
  const current = await snapshotPublicFantasyCounts(ds);
  const changed: string[] = [];
  for (const [t, c0] of Object.entries(baseline)) {
    const c1 = current[t] ?? 0;
    if (c0 !== c1) {
      changed.push(`${t}: ${c0} → ${c1}`);
    }
  }
  if (changed.length) {
    throw new Error(
      `Se detectaron ESCRITURAS en tablas fantasy de public:\n  - ${changed.join('\n  - ')}\n` +
        `Asegúrate de que todas las escrituras fantasy vayan a schema "test" (T('tabla'), schema de conexión = test).`,
    );
  }
}