// src/leaguepedia/leaguepedia.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type CargoRow<T> = { title: T };
type CargoResponse<T> = { cargoquery: CargoRow<T>[] };

export interface ScoreboardRow {
  Team: string;
  PlayerPage: string;   // ScoreboardPlayers.Link (pagina del jugador con desambiguación si la hay)
  Role: string;         // ScoreboardPlayers.Role (Top/Jungle/Mid/Bot/Support)
  DateTimeUTC: string;  // ScoreboardGames.DateTime_UTC (UTC)
  PlayerName: string;
}

export interface DerivedRosterEntry {
  playerPage: string;
  playerName?: string;
  role: 'Top' | 'Jungle' | 'Mid' | 'ADC' | 'Support';
  games: number;
  lastSeen: string;   // ISO YYYY-MM-DD HH:mm:ss UTC
  isSubstitute: boolean;
}


@Injectable()
export class LeaguepediaService {
  private readonly log = new Logger(LeaguepediaService.name);
  private readonly baseUrl = process.env.LEAGUEPEDIA_API_URL || 'https://lol.fandom.com/api.php';
  private readonly throttleMs = Number(process.env.LEAGUEPEDIA_RATE_LIMIT_MS || '300');
  private readonly userAgent = process.env.LEAGUEPEDIA_USER_AGENT || 'FantasyLoLBot/1.0';

  constructor(private readonly http: HttpService) {}

  private async sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
    return rows.map(r => r.title);
  }

  /** Normaliza roles de ScoreboardPlayers a tu taxonomía (ADC para bot/bottom). */
  private normalizeScoreboardRole(input?: string | null): 'Top'|'Jungle'|'Mid'|'ADC'|'Support'|null {
    if (!input) return null;
    const r = input.trim().toLowerCase();
    if (r === 'top') return 'Top';
    if (r === 'jungle' || r === 'jg') return 'Jungle';
    if (r === 'mid' || r === 'middle') return 'Mid';
    if (['bot','bottom','ad carry','adc','marksman'].includes(r)) return 'ADC';
    if (['support','sup'].includes(r)) return 'Support';
    return null;
  }

  /**
   * Trae filas ScoreboardPlayers+ScoreboardGames para un equipo desde una fecha mínima.
   * teamName debe coincidir con ScoreboardPlayers.Team (ej.: "G2 Esports").
   */
  
async getRecentScoreboardRowsByTeam(teamName: string, sinceISO: string, limit = 1000): Promise<ScoreboardRow[]> {
  const params = {
    tables: 'ScoreboardPlayers=SP,ScoreboardGames=SG',
    'join_on': 'SP.GameId=SG.GameId',
    fields: [
      'SP.Team=Team',
      'SP.Link=PlayerPage',
      'SP.Player=PlayerName',   
      'SP.Role=Role',
      'SG.DateTime_UTC=DateTimeUTC',
    ].join(','),
    where: `SP.Team="${teamName.replaceAll('"','\\"')}" AND SG.DateTime_UTC>="${sinceISO}"`,
    order_by: 'SG.DateTime_UTC DESC',
    limit: String(limit),
  };
  const rows = await this.cargoQuery<ScoreboardRow>(params);
  return rows;
}

  /**
   * Deriva roster "vigente" de los últimos N días:
   * - Titular por rol = quien más ha jugado ese rol en la ventana (mínimo minGamesForStarter).
   * - Otros = suplentes.
   */
  async getCurrentRosterFromScoreboards(teamName: string, opts?: {
    sinceDays?: number;
    minGamesForStarter?: number;
  }): Promise<DerivedRosterEntry[]> {
    const sinceDays = opts?.sinceDays ?? 90;
    const minGamesForStarter = opts?.minGamesForStarter ?? 2;

    const now = new Date();
    const since = new Date(now.getTime() - sinceDays * 86400000);
    const pad = (n:number)=> String(n).padStart(2,'0');
    const sinceISO = `${since.getUTCFullYear()}-${pad(since.getUTCMonth()+1)}-${pad(since.getUTCDate())} ${pad(since.getUTCHours())}:${pad(since.getUTCMinutes())}:${pad(since.getUTCSeconds())}`;

    const rows = await this.getRecentScoreboardRowsByTeam(teamName, sinceISO, 1000);

    type Role = DerivedRosterEntry['role'];
    type Agg = {
      games: number;
      lastSeen: string;
      roles: Record<Role | string, number>;
      playerName?: string;
    };

    const byPlayer = new Map<string, Agg>();

    for (const r of rows) {
      const roleN = this.normalizeScoreboardRole(r.Role);
      if (!r.PlayerPage || !roleN) continue;

      const prev: Agg = byPlayer.get(r.PlayerPage) || {
        games: 0,
        lastSeen: '1970-01-01 00:00:00',
        roles: {},
        playerName: r.PlayerName,
      };

      prev.games += 1;
      prev.roles[roleN] = (prev.roles[roleN] ?? 0) + 1;
      if (r.PlayerName && !prev.playerName) prev.playerName = r.PlayerName;
      if (r.DateTimeUTC && r.DateTimeUTC > prev.lastSeen) prev.lastSeen = r.DateTimeUTC;

      byPlayer.set(r.PlayerPage, prev);
    }

    type Candidate = { playerPage: string; playerName?: string; role: Role; games: number; lastSeen: string };
    const buckets: Record<Role, Candidate[]> = { Top: [], Jungle: [], Mid: [], ADC: [], Support: [] };

    for (const [playerPage, agg] of byPlayer.entries()) {
      const entries = Object.entries(agg.roles) as [Role, number][];
      if (!entries.length) continue;
      entries.sort((a,b)=> b[1]-a[1]);
      const primary = entries[0][0];
      buckets[primary].push({
        playerPage,
        playerName: agg.playerName,
        role: primary,
        games: agg.games,
        lastSeen: agg.lastSeen,
      });
    }

    const starters = new Set<string>();
    const out: DerivedRosterEntry[] = [];

    (Object.keys(buckets) as Role[]).forEach(role => {
      const list = buckets[role].sort((a,b)=> b.games - a.games || (a.lastSeen < b.lastSeen ? 1 : -1));
      if (!list.length) return;

      const starter = list[0];
      const starterOK = starter.games >= minGamesForStarter;

      out.push({
        playerPage: starter.playerPage,
        playerName: starter.playerName,
        role,
        games: starter.games,
        lastSeen: starter.lastSeen,
        isSubstitute: !starterOK,
      });

      if (starterOK) starters.add(starter.playerPage);

      for (let i=1; i<list.length; i++) {
        const c = list[i];
        out.push({
          playerPage: c.playerPage,
          playerName: c.playerName,
          role,
          games: c.games,
          lastSeen: c.lastSeen,
          isSubstitute: true,
        });
      }
    });

    // Completar roles faltantes con mejores globales si hiciera falta
    const roles: Role[] = ['Top','Jungle','Mid','ADC','Support'];
    const missing = roles.filter(r =>
      !out.find(o => o.role === r && starters.has(o.playerPage) && !o.isSubstitute)
    );

    if (missing.length) {
      const global: Candidate[] = [...byPlayer.entries()]
        .map(([playerPage, agg]) => {
          const entries = Object.entries(agg.roles) as [Role, number][];
          entries.sort((a,b)=> b[1]-a[1]);
          const primary = entries[0]?.[0] as Role | undefined;
          return primary
            ? { playerPage, playerName: agg.playerName, role: primary, games: agg.games, lastSeen: agg.lastSeen }
            : null;
        })
        .filter(Boolean) as Candidate[];

      global.sort((a,b)=> b.games - a.games || (a.lastSeen < b.lastSeen ? 1 : -1));

      for (const need of missing) {
        const pick = global.find(c => !starters.has(c.playerPage));
        if (pick) {
          out.push({
            playerPage: pick.playerPage,
            playerName: pick.playerName,
            role: need,
            games: pick.games,
            lastSeen: pick.lastSeen,
            isSubstitute: false,
          });
          starters.add(pick.playerPage);
        }
      }
    }

    // Deduplicar (playerPage|role)
    const seen = new Set<string>();
    const deduped: DerivedRosterEntry[] = [];
    for (const o of out) {
      const k = `${o.playerPage}|${o.role}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    return deduped;
  }

  // (Opcional) Búsqueda de equipos por nombre parcial si quieres diag
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
}