// src/riot-esports/riot-esports.controller.ts
import { Controller, Get, Post, Query, BadRequestException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RiotEsportsService } from './riot-esports.service';
import { IngestionLockService } from './ingestion-lock.service';

@Controller('riot-esports')
export class RiotEsportsController {
  constructor(
    private readonly esports: RiotEsportsService,
    private readonly lock: IngestionLockService,
  ) {}

  /** Helper: formatea errores HTTP (Axios) y DB (TypeORM) en JSON legible */
  private formatError(e: any) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    return {
      ok: false,
      error: e?.message || 'Unexpected error',
      status,
      body:
        typeof data === 'object'
          ? data
          : typeof data === 'string'
          ? data.slice(0, 800)
          : undefined,
      // info extra por si es error interno (TypeORM, etc.)
      code: e?.code,
      detail: e?.detail,
      constraint: e?.constraint,
      stack: process.env.NODE_ENV === 'production' ? undefined : e?.stack,
    };
  }

  /** === Helpers para parsear query === */
  private toBool(v?: string) { return v === '1' || v?.toLowerCase() === 'true'; }
  private toList(v?: string) {
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  }
  private toInt(v?: string, def?: number) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** Sanity check: el controller está mapeado */
  @Get('ping')
  ping() {
    return { ok: true, where: 'riot-esports/ping' };
  }

  /** Diagnóstico rápido de ENV (baseUrl + apiKey + defaults) */
  @Get('diag')
  diag() {
    const anyService = this.esports as any;
    return {
      baseUrlDefined: !!anyService.baseUrl,
      apiKeyDefined: !!anyService.apiKey,
      DEFAULT_REGION_ID: anyService.DEFAULT_REGION_ID,
      DEFAULT_ROLE_ID: anyService.DEFAULT_ROLE_ID,
    };
  }

  /** Test: llama sólo a la API externa y no toca BD (para aislar errores HTTP) */
  @Get('sync/test/leagues')
  async testLeaguesOnly() {
    try {
      const leagues = await this.esports.getLeagues();
      return {
        ok: true,
        count: leagues.length,
        sample: leagues.slice(0, 3).map((l: any) => ({
          id: l.id,
          slug: l.slug,
          name: l.name,
          region: l.region,
        })),
      };
    } catch (e: any) {
      return this.formatError(e);
    }
  }

  /** Fuerza toda la sincronización (GET y POST) */
  @Get('sync/all')
  @Post('sync/all')
  async syncAll() {
    if (this.lock.isRunning()) {
      return { ok: false, message: 'Ya hay una ingesta en curso' };
    }
    try {
      await this.lock.runExclusive(async () => {
        await this.esports.upsertLeagues();
        await this.esports.upsertTeamsAndPlayers();
        // Próximas etapas cuando las tengas:
        // await this.esports.upsertTournaments();
        // await this.esports.upsertScheduleAndMatches();
        // await this.esports.upsertGames();
        // await this.esports.upsertGameStats({ windowHours: 48 });
      });
      return { ok: true };
    } catch (e: any) {
      return this.formatError(e);
    }
  }

  /** Fuerza sincronización parcial vía query param scope (GET y POST) */
  @Get('sync')
  @Post('sync')
  async syncPartial(@Query('scope') scope?: string) {
    if (!scope) throw new BadRequestException('Falta scope');
    if (this.lock.isRunning()) {
      return { ok: false, message: 'Ya hay una ingesta en curso' };
    }

    try {
      const lower = scope.toLowerCase();
      await this.lock.runExclusive(async () => {
        switch (lower) {
          case 'leagues':
            await this.esports.upsertLeagues();
            break;
          case 'teams-players':
            await this.esports.upsertTeamsAndPlayers();
            break;
          // case 'tournaments':
          //   await this.esports.upsertTournaments();
          //   break;
          // case 'schedule':
          //   await this.esports.upsertScheduleAndMatches();
          //   break;
          // case 'games':
          //   await this.esports.upsertGames();
          //   break;
          // case 'stats':
          //   await this.esports.upsertGameStats({ windowHours: 48 });
          //   break;
          default:
            throw new BadRequestException('scope inválido');
        }
      });
      return { ok: true, scope: lower };
    } catch (e: any) {
      return this.formatError(e);
    }
  }

  // =========================================================
  // 🚀 NUEVO: HÍBRIDO (Leaguepedia + REL)
  // =========================================================

  /**
   * Solo híbrido (REL + Leaguepedia por scoreboards)
   */
  @Get('sync/hybrid')
  @Post('sync/hybrid')
  async syncHybrid(
    @Query('leagues') leagues?: string,                // ej: "lec,lck"
    @Query('pastDays') pastDays?: string,              // ventana schedule REL
    @Query('futureDays') futureDays?: string,          // ventana schedule REL
    @Query('deactivateNonListed') deact?: string,      // "1" | "true"
    @Query('force') force?: string,                    // "1" | "true"  <-- FALTABA
    @Query('sinceDaysForScoreboards') sinceDaysSB?: string,     // opcional: 90 por defecto
    @Query('minGamesForStarter') minGamesStarter?: string,      // opcional: 2 por defecto
  ) {
    if (this.lock.isRunning()) {
      return { ok: false, message: 'Ya hay una ingesta en curso' };
    }
    try {
      await this.lock.runExclusive(async () => {
        await this.esports.upsertCurrentRostersHybrid({
          leagues: this.toList(leagues),
          pastDays: this.toInt(pastDays, undefined),
          futureDays: this.toInt(futureDays, undefined),
          deactivateNonListed: this.toBool(deact),
          force: this.toBool(force), // <-- AHORA SÍ SE PASA
          sinceDaysForScoreboards: this.toInt(sinceDaysSB, undefined),
          minGamesForStarter: this.toInt(minGamesStarter, undefined),
        });
      });
      return { ok: true, scope: 'hybrid' };
    } catch (e: any) {
      return this.formatError(e);
    }
  }

  /**
   * Full: primero REL teams-players y luego híbrido
   */
  
@Get('sync/hybrid/full')
@Post('sync/hybrid/full')
async syncHybridFull(
  @Query('leagues') leagues?: string,
  @Query('pastDays') pastDays?: string,
  @Query('futureDays') futureDays?: string,
  @Query('deactivateNonListed') deact?: string,
  @Query('force') force?: string,
  @Query('sinceDaysForScoreboards') sinceDaysSB?: string,
  @Query('minGamesForStarter') minGamesStarter?: string,
  @Query('limitTeams') limitTeams?: string,        // ← NUEVO (opcional)
  @Res({ passthrough: true }) res?: Response,      // ← NUEVO para setTimeout
) {
  // Evita 504 del proxy mientras la ingesta tarda
  res?.setTimeout(10 * 60 * 1000); // 10 min

  if (this.lock.isRunning()) {
    return { ok: false, message: 'Ya hay una ingesta en curso' };
  }

  try {
    await this.lock.runExclusive(async () => {
      // 1) REL base (equipos + jugadores)
      await this.esports.upsertTeamsAndPlayers();

      // 2) Híbrido (ajusta roster vigente desde Leaguepedia)
      await this.esports.upsertCurrentRostersHybrid({
        leagues: this.toList(leagues),
        pastDays: this.toInt(pastDays, undefined),
        futureDays: this.toInt(futureDays, undefined),
        deactivateNonListed: this.toBool(deact),
        force: this.toBool(force),
        sinceDaysForScoreboards: this.toInt(sinceDaysSB, undefined),
        minGamesForStarter: this.toInt(minGamesStarter, undefined),
        // SOLO para pruebas: limita número de equipos
        limitTeams: this.toInt(limitTeams, undefined),
      });
    });
    return { ok: true, scope: 'hybrid-full' };
  } catch (e: any) {
    return this.formatError(e);
  }
}


  /**
   * Diagnóstico: consulta directa a Leaguepedia (NO toca BD).
   * Nota: accedemos al servicio de Leaguepedia que está inyectado dentro del RiotEsportsService.
   * Si prefieres no usar "any", te creo un método público en el service p.ej. diagLeaguepediaRoster(team)
   */
  @Get('diag/leaguepedia/roster')
  async diagLeaguepediaRoster(@Query('team') team?: string) {
    if (!team) throw new BadRequestException('Falta ?team=');
    try {
      const svc: any = this.esports as any;
      if (!svc.leaguepedia) {
        throw new Error('LeaguepediaService no está disponible en RiotEsportsService');
      }
      const rows = await svc.leaguepedia.getCurrentRosterByTeamName(team);
      return { ok: true, team, count: rows.length, roster: rows };
    } catch (e: any) {
      return this.formatError(e);
    }
  }



  // Helpers ya añadidos antes:
//  this.toBool(), this.toList(), this.toInt()

/**
 * Diagnóstico: busca equipos en Leaguepedia por nombre parcial.
 * Útil para ver Name / _pageName reales antes de pedir roster vigente.
 */
@Get('diag/leaguepedia/teams-search')
async diagTeamsSearch(@Query('q') q?: string) {
  if (!q) throw new BadRequestException('Falta ?q=');
  try {
    const svc: any = this.esports as any;
    if (!svc.leaguepedia) throw new Error('LeaguepediaService no está disponible');
    const rows = await svc.leaguepedia.searchTeamsByName(q);
    return { ok: true, q, count: rows.length, teams: rows };
  } catch (e) {
    return this.formatError(e);
  }
}

/**
 * Diagnóstico: roster vigente por _pageName (Teams._pageName).
 * En algunos casos el Name no coincide exactamente, pero el _pageName sí.
 */
@Get('diag/leaguepedia/roster-by-page')
async diagRosterByPage(@Query('teamPage') teamPage?: string) {
  if (!teamPage) throw new BadRequestException('Falta ?teamPage=');
  try {
    const svc: any = this.esports as any;
    if (!svc.leaguepedia) throw new Error('LeaguepediaService no está disponible');
    const rows = await svc.leaguepedia.getCurrentRosterByPageName(teamPage);
    return { ok: true, teamPage, count: rows.length, roster: rows };
  } catch (e) {
    return this.formatError(e);
  }
}

  @Get('diag/leaguepedia/lineup')
  async diagRecentLineup(@Query('team') team?: string, @Query('sinceDays') sinceDays?: string) {
    if (!team) throw new BadRequestException('Falta ?team=');
    try {
      const days = Number(sinceDays ?? 90);
      const svc: any = this.esports as any;
      const rows = await svc.leaguepedia.getCurrentRosterFromScoreboards(team, { sinceDays: days });
      return { ok: true, team, sinceDays: days, count: rows.length, roster: rows };
    } catch (e) {
      return this.formatError(e);
    }
  }

}