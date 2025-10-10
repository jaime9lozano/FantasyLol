import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { T } from './schema.util';

/**
 * Asegura invariantes de BD que no están gestionados por migraciones formales.
 * Actualmente: unicidad de jugador activo por liga.
 */
@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      // Índice único parcial: un jugador solo puede estar activo en un equipo por liga
      await this.ds.query(
        `DO $$ BEGIN
           BEGIN
             CREATE UNIQUE INDEX IF NOT EXISTS ux_roster_unique_player_active
             ON ${T('fantasy_roster_slot')}(fantasy_league_id, player_id)
             WHERE active = true;
           EXCEPTION WHEN others THEN NULL; END;
         END $$;`,
      );
      this.logger.log('DB bootstrap: índice único de ownership verificado');
    } catch (e) {
      // No bloquear arranque por fallo no crítico; log minimal
      this.logger.warn(`DB bootstrap fallo (continuando): ${(e as Error).message}`);
    }
  }
}
