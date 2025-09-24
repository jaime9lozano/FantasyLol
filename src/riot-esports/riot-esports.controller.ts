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

  // // Si quieres protegerlo con un token:
  // private ensureAdminToken(req: Request) {
  //   const expected = process.env.ADMIN_SYNC_TOKEN;
  //   const got = req.headers['x-admin-token'];
  //   if (expected && got !== expected) throw new UnauthorizedException();
  // }

  /** Fuerza toda la sincronización (GET) */
  @Get('sync/all')
  async syncAllGET() {
    if (this.lock.isRunning()) {
      return { ok: false, message: 'Ya hay una ingesta en curso' };
    }
    const res = await this.lock.runExclusive(async () => {
      await this.esports.upsertLeagues();
      await this.esports.upsertTeamsAndPlayers();
      // await this.esports.upsertTournaments();
      // await this.esports.upsertScheduleAndMatches();
      // await this.esports.upsertGames();
      // await this.esports.upsertGameStats({ windowHours: 48 });
      return true;
    });
    return { ok: !!res };
  }

  /** Fuerza toda la sincronización (POST) */
  @Post('sync/all')
  async syncAllPOST() {
    return this.syncAllGET();
  }

  /** Fuerza sincronización parcial vía query param scope */
  @Get('sync')
  async syncPartialGET(@Query('scope') scope?: string) {
    if (!scope) throw new BadRequestException('Falta scope');
    if (this.lock.isRunning()) {
      return { ok: false, message: 'Ya hay una ingesta en curso' };
    }

    const lower = scope.toLowerCase();
    const res = await this.lock.runExclusive(async () => {
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
      return true;
    });

    return { ok: !!res, scope: lower };
  }

  /** POST equivalente al GET parcial */
  @Post('sync')
  async syncPartialPOST(@Query('scope') scope?: string) {
    return this.syncPartialGET(scope);
  }
}