import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type CargoRow<T> = { title: T };
type CargoResponse<T> = { cargoquery: CargoRow<T>[] };

export interface CurrentRosterRow {
  TeamPage: string;      // Teams._pageName
  TeamName: string;      // Teams.Name
  Role: string;          // Ten.Role (Top/Jungle/Mid/ADC/Support/..., según wiki)
  IsSubstitute: string;  // "1" | "0"
  ID: string;            // Players.ID (ID textual del jugador en la wiki)
  Name: string;          // Players.Name (nombre completo)
  Country?: string;
}

@Injectable()
export class LeaguepediaService {
  private readonly log = new Logger(LeaguepediaService.name);
  private readonly baseUrl = process.env.LEAGUEPEDIA_API_URL || 'https://lol.fandom.com/api.php';
  private readonly throttleMs = Number(process.env.LEAGUEPEDIA_RATE_LIMIT_MS || '300');
  private readonly userAgent = process.env.LEAGUEPEDIA_USER_AGENT || 'FantasyLoLBot/1.0';

  constructor(private readonly http: HttpService) {}

  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async cargoQuery<T = any>(params: Record<string, string>): Promise<T[]> {
    if (this.throttleMs > 0) await this.sleep(this.throttleMs);

    const query = { action: 'cargoquery', format: 'json', ...params };
    const res = await firstValueFrom(
      this.http.get<CargoResponse<T>>(this.baseUrl, {
        params: query,
        headers: { 'User-Agent': this.userAgent },
        timeout: 15000,
      }),
    );
    const rows = res?.data?.cargoquery || [];
    return rows.map((r) => r.title);
  }

  /** Roster vigente (IsCurrent="1") para un equipo por Teams.Name */
  async getCurrentRosterByTeamName(teamName: string): Promise<CurrentRosterRow[]> {
    const params = {
      tables: 'Teams,Tenures=Ten,Players=P',
      'join_on': 'Teams._pageName=Ten.Team,Ten.Player=P._pageName',
      fields: [
        'Teams._pageName=TeamPage',
        'Teams.Name=TeamName',
        'Ten.Role=Role',
        'Ten.IsSubstitute=IsSubstitute',
        'P.ID=ID',
        'P.Name=Name',
        'P.Country=Country',
      ].join(','),
      where: `Ten.IsCurrent="1" AND Teams.Name="${teamName.replaceAll('"', '\\"')}"`,
      limit: '100',
    };
    return this.cargoQuery<CurrentRosterRow>(params);
  }

  /** Batch sencillo (secuencial para no abusar del rate) */
  async getCurrentRostersByTeamNames(teamNames: string[]): Promise<Record<string, CurrentRosterRow[]>> {
    const out: Record<string, CurrentRosterRow[]> = {};
    for (const name of teamNames) {
      try {
        out[name] = await this.getCurrentRosterByTeamName(name);
      } catch (e: any) {
        this.log.warn(`Leaguepedia roster fallo para ${name}: ${e?.message || e}`);
        out[name] = [];
      }
    }
    return out;
  }

  // 1) Buscar equipos por nombre parcial (LIKE)
async searchTeamsByName(term: string) {
  const safe = term.replaceAll('"', '\\"');
  const where = [
    `Teams.Name LIKE "%${safe}%"`,
    `Teams._pageName LIKE "%${safe}%"`,
    `Teams.Short LIKE "%${safe}%"`,
  ].join(' OR ');

  const params = {
    tables: 'Teams',
    fields: [
      'Teams._pageName=TeamPage',
      'Teams.Name=TeamName',
      'Teams.Short=Short',
      'Teams.Region=Region',
      'Teams.Location=Location',
    ].join(','),
    where,
    limit: '50',
  };

  return this.cargoQuery(params);
}

// 2) Roster vigente por _pageName (Teams._pageName)
async getCurrentRosterByPageName(teamPage: string) {
  const params = {
    tables: 'Teams,Tenures=Ten,Players=P',
    'join_on': 'Teams._pageName=Ten.Team,Ten.Player=P._pageName',
    fields: [
      'Teams._pageName=TeamPage',
      'Teams.Name=TeamName',
      'Ten.Role=Role',
      'Ten.IsSubstitute=IsSubstitute',
      'P.ID=ID',
      'P.Name=Name',
      'P.Country=Country',
    ].join(','),
    where: `Ten.IsCurrent="1" AND Teams._pageName="${teamPage.replaceAll('"','\\"')}"`,
    limit: '100',
  };
  return this.cargoQuery(params);
}
}