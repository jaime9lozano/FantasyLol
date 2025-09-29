import { Controller, Post, Query, BadRequestException } from '@nestjs/common';
import { CronJobsService } from './cron.service';

type JobKey = 'leagues' | 'tournaments' | 'teams-players' | 'games' | 'stats' | 'roster';

const ALLOWED: JobKey[] = ['leagues', 'tournaments', 'teams-players', 'games', 'stats', 'roster'];

@Controller('admin/cron')
export class CronController {
  constructor(private readonly cron: CronJobsService) {}

  @Post('run')
  async run(@Query('job') job: string) {
    const key = (job || '').toLowerCase() as JobKey;
    if (!ALLOWED.includes(key)) {
      throw new BadRequestException({ error: 'job inválido', allowed: ALLOWED });
    }

    switch (key) {
      case 'leagues':
        return { ok: true, job: key, result: await this.cron.leaguesWeekly() };
      case 'tournaments':
        return { ok: true, job: key, result: await this.cron.tournamentsDaily() };
      case 'teams-players':
        return { ok: true, job: key, result: await this.cron.teamsAndPlayersDaily() };
      case 'games':
        return { ok: true, job: key, result: await this.cron.gamesHourly() };
      case 'stats':
        return { ok: true, job: key, result: await this.cron.statsHourly() };
      case 'roster':
        return { ok: true, job: key, result: await this.cron.rosterSixHourly() };
    }
  }

  // (Opcional) Ejecutar toda la tubería en orden seguro
  @Post('run-all')
  async runAll() {
    const res: Record<string, unknown> = {};
    res.leagues = await this.cron.leaguesWeekly();
    res.tournaments = await this.cron.tournamentsDaily();
    res.teamsPlayers = await this.cron.teamsAndPlayersDaily();
    res.games = await this.cron.gamesHourly();
    res.stats = await this.cron.statsHourly();
    res.roster = await this.cron.rosterSixHourly();
    return { ok: true, ...res };
  }
}