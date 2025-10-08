import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Crea índices adicionales para performance de consultas de scoring y ownership.
 * Se aplica en el schema activo (DB_SCHEMA o public). No toca tablas core (public.*) salvo que se ejecute con schema=public.
 */
export class AddFantasyIndexes1710000000000 implements MigrationInterface {
  name = 'AddFantasyIndexes1710000000000';

  private schema(): string {
    return process.env.DB_SCHEMA || 'public';
  }

  public async up(qr: QueryRunner): Promise<void> {
  const schema = this.schema();
    // Roster slot indexes
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_roster_league_player_active ON "${schema}"."fantasy_roster_slot" (fantasy_league_id, player_id, active)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_roster_league_team_active ON "${schema}"."fantasy_roster_slot" (fantasy_league_id, fantasy_team_id, active)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_roster_validity ON "${schema}"."fantasy_roster_slot" (valid_from, valid_to)`);
    // Player points index
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_player_points_league_player ON "${schema}"."fantasy_player_points" (fantasy_league_id, player_id)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
  const schema = this.schema();
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_roster_league_player_active`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_roster_league_team_active`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_roster_validity`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_player_points_league_player`);
  }
}
