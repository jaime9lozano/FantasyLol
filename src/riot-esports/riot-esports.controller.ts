// src/riot-esports/riot-esports.controller.ts
import { Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
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
}