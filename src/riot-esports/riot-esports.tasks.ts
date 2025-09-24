// src/riot-esports/riot-esports.tasks.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiotEsportsService } from './riot-esports.service';
import { IngestionLockService } from './ingestion-lock.service';

@Injectable()
export class RiotEsportsTasks {
  private readonly logger = new Logger(RiotEsportsTasks.name);

  constructor(
    private readonly esports: RiotEsportsService,
    private readonly lock: IngestionLockService,
  ) {}

  // CRON diario a las 03:00 (hora de Madrid)
  @Cron(process.env.SYNC_CRON_DAILY || CronExpression.EVERY_DAY_AT_3AM, {
    timeZone: process.env.SYNC_TZ || 'Europe/Madrid',
  })
  async dailyFullSync() {
    if (this.lock.isRunning()) {
      this.logger.warn('CRON omitido: hay una ingesta en curso.');
      return;
    }

    this.logger.log('CRON diario: iniciando sincronización completa...');
    const t0 = Date.now();

    const result = await this.lock.runExclusive(async () => {
      await this.esports.upsertLeagues();
      await this.esports.upsertTeamsAndPlayers();
      // Próximas etapas:
      // await this.esports.upsertTournaments();
      // await this.esports.upsertScheduleAndMatches();
      // await this.esports.upsertGames();
      // await this.esports.upsertGameStats({ windowHours: 48 });
    });

    if (result === null) {
      this.logger.warn('CRON: no se ejecuta porque ya había una corrida activa.');
      return;
    }

    this.logger.log(
      `CRON diario: completado en ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }

  // Incremental cada 30 min (ajusta si quieres)
  @Cron(process.env.SYNC_CRON_INCREMENTAL || '0 */30 * * * *', {
    timeZone: process.env.SYNC_TZ || 'Europe/Madrid',
  })
  async incremental() {
    if (this.lock.isRunning()) {
      this.logger.warn('CRON incremental omitido: hay una ingesta en curso.');
      return;
    }

    this.logger.log('CRON incremental: iniciando actualización parcial...');
    const t0 = Date.now();

    const result = await this.lock.runExclusive(async () => {
      // En esta fase solemos traer schedule + stats cercanas en el tiempo
      // Por ahora, repetimos lo que tienes:
      await this.esports.upsertLeagues();
      await this.esports.upsertTeamsAndPlayers();
      // Cuando implementes partidos/estadísticas, muévelo aquí:
      // await this.esports.upsertScheduleAndMatches({ horizonHours: 36 });
      // await this.esports.upsertGameStats({ windowHours: 6 });
    });

    if (result === null) {
      this.logger.warn('CRON incremental: no se ejecuta, corrida activa.');
      return;
    }

    this.logger.log(
      `CRON incremental: completado en ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
}