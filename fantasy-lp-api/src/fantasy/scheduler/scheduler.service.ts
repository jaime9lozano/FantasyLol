// src/fantasy/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MarketService } from '../market/market.service';
import { ValuationService } from '../valuation/valuation.service';
import { ScoringService } from '../scoring/scoring.service';
import { ScoringRewardsService } from '../scoring/scoring-rewards.service';
import { T } from '../../database/schema.util';

@Injectable()
export class FantasySchedulerService {
  private readonly logger = new Logger(FantasySchedulerService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly market: MarketService,
    private readonly valuation: ValuationService,
    private readonly scoring: ScoringService,
    private readonly rewards: ScoringRewardsService,
  ) {}

  /**
   * Helper: convierte un Date UTC a hora local (hh:mm) de una timezone IANA, sin dependencias externas.
   */
  private getLocalHM(dateUTC: Date, timeZone: string): { hour: number; minute: number; dateStr: string } {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
    const parts = fmt.formatToParts(dateUTC);
    const get = (t: string) => parts.find(p => p.type === t)?.value!;
    const hour = parseInt(get('hour'), 10);
    const minute = parseInt(get('minute'), 10);
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD local
    return { hour, minute, dateStr };
  }

  /**
   * 1) LOCK de jugadores: cada minuto bloquea jugadores que tengan partida
   *  - Ventana: [now()-15min, now()+15min]; lock_until = game.datetime_utc + 2h (fallback).
   *  - Mantiene core en public.* y fantasy en schema actual (T()).
   */
  @Cron('* * * * *')
  async lockPlayersAroundGames() {
    try {
      const sql = `
        WITH window_games AS (
          SELECT id AS game_id,
                 team1_id,
                 team2_id,
                 datetime_utc,
                 datetime_utc - interval '15 minutes' AS lock_from,
                 datetime_utc + interval '2 hours'   AS lock_to
          FROM public.game
          WHERE datetime_utc BETWEEN now() - interval '15 minutes' AND now() + interval '15 minutes'
        )
        UPDATE ${T('fantasy_roster_slot')} fr
        SET locked_until = GREATEST(COALESCE(fr.locked_until, now()), wg.lock_to),
            updated_at   = now()
        FROM window_games wg
        JOIN public.team_player_membership tpm
          ON (tpm.first_seen_utc IS NULL OR tpm.first_seen_utc <= wg.datetime_utc)
         AND (tpm.last_seen_utc  IS NULL OR tpm.last_seen_utc  >= wg.datetime_utc)
        WHERE fr.active = true
          AND tpm.player_id = fr.player_id
          AND (tpm.team_id = wg.team1_id OR tpm.team_id = wg.team2_id)
          AND now() >= wg.lock_from
          AND (fr.locked_until IS NULL OR fr.locked_until < wg.lock_to);
      `;
      await this.ds.query(sql);
    } catch (e) {
      this.logger.error('Error en lockPlayersAroundGames()', e as any);
    }
  }

  /**
   * 2) Cierre de subastas expiradas (AUCTION): cada minuto
   *  - Busca ligas con órdenes OPEN y closes_at <= now() y llama a MarketService.closeDailyAuctions por liga.
   */
  @Cron('* * * * *')
  async closeExpiredAuctions() {
    try {
      const rows: Array<{ fantasy_league_id: number }> = await this.ds.query(
        `
        SELECT DISTINCT fantasy_league_id
        FROM ${T('market_order')}
        WHERE type = 'AUCTION' AND status = 'OPEN' AND closes_at <= now()
        `
      );

      for (const r of rows) {
        await this.market.closeDailyAuctions(r.fantasy_league_id);
      }
      // this.logger.debug(`Cierre de subastas: ligas procesadas=${rows.length}`);
    } catch (e) {
      this.logger.error('Error en closeExpiredAuctions()', e as any);
    }
  }

  /**
   * 2.b) Rotación automática de ciclo: cada 5 minutos
   *  - Para cada liga, si no hay ciclo o el último ciclo ya está cerrado (closes_at <= now), rota: liquida y abre nuevo.
   *  - No expone endpoint público; esto sustituye a los botones de ciclo en producción.
   */
  @Cron('*/5 * * * *')
  async autoRotateCycles() {
    try {
      const leagues: Array<{ id: number }> = await this.ds.query(`SELECT id FROM ${T('fantasy_league')}`);
      const now = new Date();
      for (const lg of leagues) {
        // settleAndRotate cierra vencidas y abre nuevo si procede
        // Primero cancela órdenes abiertas de jugadores ya en roster activo para evitar duplicidades
        try { await this.market.cancelOpenOrdersForConflicts(lg.id); } catch {}
        await this.market.settleAndRotate(lg.id, now);
      }
    } catch (e) {
      this.logger.error('Error en autoRotateCycles()', e as any);
    }
  }

  /**
   * 3) Revaluación nocturna por liga.
   *  - Comprueba todas las ligas cada 5 minutos; si es ~03:00 local y no se recalculó hoy, ejecuta recalcAllValues.
   *  - Mantiene fantasy en schema actual (T()).
   */
  @Cron('*/5 * * * *')
  async nightlyRevaluationPerLeague() {
    try {
      const leagues: Array<{ id: number; timezone: string }> = await this.ds.query(
        `SELECT id, timezone FROM ${T('fantasy_league')}`
      );

      const nowUTC = new Date();
      for (const lg of leagues) {
        const { hour, minute, dateStr } = this.getLocalHM(nowUTC, lg.timezone || 'Europe/Madrid');

        // Ventana: 03:00-03:09 local
        if (hour === 3 && minute < 10) {
          // ¿ya hay recálculo hoy?
          const exists: Array<{ ok: number }> = await this.ds.query(
            `
            SELECT 1 AS ok
            FROM ${T('fantasy_player_valuation')}
            WHERE fantasy_league_id = $1 AND calc_date = $2
            LIMIT 1
            `,
            [lg.id, dateStr]
          );
          if (exists.length === 0) {
            // Mantengo tu firma (leagueId, nowUTC). Si tu servicio usa otra, ajusta aquí.
            await this.valuation.recalcAllValues(lg.id, nowUTC);
            this.logger.log(`Revaluación ejecutada para liga ${lg.id} (${lg.timezone})`);
          }
        }
      }
    } catch (e) {
      this.logger.error('Error en nightlyRevaluationPerLeague()', e as any);
    }
  }

  /**
   * 4) Recompute de periodos activos y recientes (cada 5 minutos)
   *  - Recalcula team_points para el periodo en curso y el anterior por cada liga.
   *  - No paga recompensas aquí; sólo puntos. Las recompensas se pagan en closeIfFinished.
   */
  @Cron('*/5 * * * *')
  async recomputeActiveAndRecentPeriods() {
    try {
      const leagues: Array<{ id: number }> = await this.ds.query(
        `SELECT id FROM ${T('fantasy_league')}`,
      );
      for (const lg of leagues) {
        const periods: Array<{ id: number; starts_at: Date; ends_at: Date }>= await this.ds.query(
          `SELECT id, starts_at, ends_at
           FROM ${T('fantasy_scoring_period')}
           WHERE fantasy_league_id = $1
           ORDER BY starts_at ASC`,
          [lg.id],
        );
        if (!periods.length) continue;
        // Elegir último (actual) y penúltimo (reciente) por seguridad
        const last = periods[periods.length - 1];
        const prev = periods.length > 1 ? periods[periods.length - 2] : undefined;

        // Si estamos dentro del último, recomputar
        const now = new Date();
        if (now >= new Date(last.starts_at)) {
          await this.scoring.computeForPeriod(lg.id, last.id);
        }
        // Recalcular el anterior por si hubo datos tardíos
        if (prev) {
          await this.scoring.computeForPeriod(lg.id, prev.id);
        }
      }
    } catch (e) {
      this.logger.error('Error en recomputeActiveAndRecentPeriods()', e as any);
    }
  }

  /**
   * 5) Cierre de periodos finalizados con gracia (cada 10 minutos)
   *  - Detecta periodos cuya ends_at + grace ha pasado y marca recompensas si no se pagaron.
   */
  @Cron('*/10 * * * *')
  async closeFinishedPeriodsWithRewards() {
    const graceMin = Number(process.env.FANTASY_PERIOD_GRACE_MIN ?? '15');
    try {
      const leagues: Array<{ id: number }> = await this.ds.query(
        `SELECT id FROM ${T('fantasy_league')}`,
      );
      const now = new Date();
      for (const lg of leagues) {
        const rows: Array<{ id: number; ends_at: string }>= await this.ds.query(
          `SELECT id, ends_at
           FROM ${T('fantasy_scoring_period')}
           WHERE fantasy_league_id = $1
             AND ends_at <= (now() - ($2::text || ' minutes')::interval)
           ORDER BY ends_at ASC`,
          [lg.id, graceMin],
        );
        for (const p of rows) {
          // Comprobar si ya hay asientos de reward de este periodo
          const paid: Array<{ ok: number }> = await this.ds.query(
            `SELECT 1 AS ok
             FROM ${T('fantasy_budget_ledger')}
             WHERE fantasy_league_id = $1 AND type = 'REWARD_PERIOD' AND ref_id = $2
             LIMIT 1`,
            [lg.id, p.id],
          );
          if (paid.length) continue;
          // Asegurar recompute final y luego pagar
          await this.scoring.computeForPeriod(lg.id, p.id);
          await this.rewards.rewardPeriod(lg.id, p.id);
          this.logger.log(`Periodo ${p.id} cerrado y recompensado en liga ${lg.id}`);
        }
      }
    } catch (e) {
      this.logger.error('Error en closeFinishedPeriodsWithRewards()', e as any);
    }
  }
}
