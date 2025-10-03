// src/fantasy/demo/fantasy-demo.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FantasyLeaguesService } from '../leagues/fantasy-leagues.service';
import { FantasyTeamsService } from '../teams/fantasy-teams.service';
import { MarketService } from '../market/market.service';
import { FantasyManager } from '../leagues/fantasy-manager.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';

type PlayerPick = { player_id: number; role_code?: string };

@Injectable()
export class FantasyDemoService {
  private readonly logger = new Logger(FantasyDemoService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly leaguesSvc: FantasyLeaguesService,
    private readonly teamsSvc: FantasyTeamsService,
    private readonly marketSvc: MarketService,
  ) {}

  private async ensureManagers(): Promise<{ a: FantasyManager; b: FantasyManager }> {
    const [a] = await this.ds.query(`
      INSERT INTO public.fantasy_manager (display_name, email)
      VALUES ('Alice','alice@example.com')
      ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name
      RETURNING *`);
    const [b] = await this.ds.query(`
      INSERT INTO public.fantasy_manager (display_name, email)
      VALUES ('Bob','bob@example.com')
      ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name
      RETURNING *`);
    return { a, b };
  }

  private async getFreeAgentsWithRole(leagueId: number, limit = 500): Promise<PlayerPick[]> {
    // Devuelve agentes libres en la liga con su rol principal si lo tenemos
    const rows: Array<{ player_id: number; role_code: string | null }> = await this.ds.query(`
      SELECT DISTINCT p.id AS player_id, r.code AS role_code
      FROM public.player p
      LEFT JOIN public.team_player_membership tpm
             ON tpm.player_id = p.id AND tpm.is_current = true
      LEFT JOIN public.role r ON r.id = tpm.main_role_id
      LEFT JOIN public.fantasy_roster_slot fr
             ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
      WHERE fr.id IS NULL
      LIMIT $2
    `, [leagueId, limit]);
    return rows.map(r => ({ player_id: r.player_id, role_code: r.role_code ?? undefined }));
  }

  private preferSlots(assignable: number[], roleMap: Map<number, string>, required: string[]) {
    const chosen: { playerId: number; slot: string; starter: boolean }[] = [];
    const need = new Set(required); // TOP,JNG,MID,ADC,SUP
    // 1) Prioriza roles “naturales”
    for (const pid of assignable) {
      if (chosen.length >= required.length) break;
      const rc = (roleMap.get(pid) || '').toUpperCase();
      if (need.has(rc)) {
        chosen.push({ playerId: pid, slot: rc, starter: true });
        need.delete(rc);
      }
    }
    // 2) Completa slots que falten con cualquier jugador libre
    for (const rc of Array.from(need)) {
      const pid = assignable.find(p => !chosen.some(c => c.playerId === p));
      if (pid != null) chosen.push({ playerId: pid, slot: rc, starter: true });
    }
    return chosen;
  }

  private async assignSixPlayers(teamId: number, leagueId: number): Promise<{ starters: any[]; bench: any[] }> {
    const requiredSlots = ['TOP','JNG','MID','ADC','SUP'];

    // Trae agentes libres actuales
    const free = await this.getFreeAgentsWithRole(leagueId, 1000);
    if (free.length < 6) {
      throw new BadRequestException(`No hay suficientes agentes libres para completar 6 jugadores (hay ${free.length}). Ingresa más players o reduce el tamaño en la demo.`);
    }
    const assignable = free.map(f => f.player_id).slice(0, 6);

    // Rol mapping
    const roleRows: Array<{ player_id: number; role_code: string | null }> = await this.ds.query(`
      SELECT p.id AS player_id, r.code AS role_code
      FROM public.player p
      LEFT JOIN public.team_player_membership tpm ON tpm.player_id = p.id AND tpm.is_current = true
      LEFT JOIN public.role r ON r.id = tpm.main_role_id
      WHERE p.id = ANY($1::int[])`, [assignable]);

    const roleMap = new Map<number, string>(roleRows.map(r => [r.player_id, (r.role_code || '').toUpperCase()]));

    // Elige 5 titulares por slot, y 1 bench
    const starters = this.preferSlots(assignable, roleMap, requiredSlots);

    // Bench = cualquiera restante
    const benchPid = assignable.find(pid => !starters.some(c => c.playerId === pid))!;
    const bench = [{ playerId: benchPid, slot: 'BENCH', starter: false }];

    // Inserta slots
    for (const c of [...starters, ...bench]) {
      await this.ds.query(`
        INSERT INTO public.fantasy_roster_slot
          (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active, acquisition_price, clause_value, valid_from, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, 0::bigint, 0::bigint, now(), now(), now())
        ON CONFLICT DO NOTHING
      `, [leagueId, teamId, c.playerId, c.slot, c.starter]);
    }

    // Valuación base 1M para los 6
    await this.ds.query(`
      INSERT INTO public.fantasy_player_valuation (fantasy_league_id, player_id, current_value, last_change, calc_date)
      SELECT $1, unnest($2::int[]), 1000000::bigint, 0::bigint, CURRENT_DATE
      ON CONFLICT (fantasy_league_id, player_id) DO NOTHING
    `, [leagueId, assignable]);

    return {
      starters,
      bench,
    };
  }

  async runDemo() {
    // 0) Managers
    const { a: mgrA, b: mgrB } = await this.ensureManagers();

    // 1) Liga
    const league: FantasyLeague = await this.leaguesSvc.createLeague(mgrA.id, {
      name: 'LEC Amigos',
      timezone: 'Europe/Madrid',
      marketCloseTime: '20:00',
      scoringConfig: { kill: 3, assist: 2, death: -1, cs10: 0.5, win: 2 },
      rosterConfig: { slots: ['TOP','JNG','MID','ADC','SUP'], bench: 2 },
    } as any);

    // 2) Join A y B
    const joinA = await this.leaguesSvc.joinLeague({ fantasyManagerId: mgrA.id, inviteCode: league.inviteCode, teamName: 'Team Alice' });
    const joinB = await this.leaguesSvc.joinLeague({ fantasyManagerId: mgrB.id, inviteCode: league.inviteCode, teamName: 'Team Bob' });
    const teamAId = joinA.teamId;
    const teamBId = joinB.teamId;

    // 3) Asignar 6 jugadores a A
    const assignedA = await this.assignSixPlayers(teamAId, league.id);

    // 4) Asignar 6 jugadores a B (vuelve a calcular en base a libres después de A)
    const assignedB = await this.assignSixPlayers(teamBId, league.id);

    // 5) Crear AUCTION (cierre +10 min) sobre un agente libre y poner una puja de Bob
    const freeOne: Array<{ player_id: number }> = await this.ds.query(`
      SELECT p.id AS player_id
      FROM public.player p
      LEFT JOIN public.fantasy_roster_slot fr
        ON fr.player_id = p.id AND fr.fantasy_league_id = $1 AND fr.active = true
      WHERE fr.id IS NULL
      LIMIT 1
    `, [league.id]);

    let auctionOrder: any = null;
    let bid: any = null;

    if (freeOne.length > 0) {
      const freeId = freeOne[0].player_id;
      const now = new Date();
      const closesAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutos

      const [order] = await this.ds.query(`
        INSERT INTO public.market_order (fantasy_league_id, player_id, owner_team_id, type, status, min_price, opens_at, closes_at, created_at, updated_at)
        VALUES ($1, $2, NULL, 'AUCTION', 'OPEN', 1000000::bigint, now(), $3, now(), now())
        RETURNING *;
      `, [league.id, freeId, closesAt.toISOString()]);
      auctionOrder = order;

      // Poner puja inicial de Bob
      bid = await this.marketSvc.placeBid({
        marketOrderId: order.id,
        bidderTeamId: teamBId,
        amount: 1_500_000,
      });
    }

    // 6) Crear LISTING con un titular de Alice (minPrice 2M)
    const aliceStarter: Array<{ player_id: number }> = await this.ds.query(`
      SELECT player_id
      FROM public.fantasy_roster_slot
      WHERE fantasy_league_id = $1 AND fantasy_team_id = $2 AND active = true AND starter = true
      LIMIT 1
    `, [league.id, teamAId]);

    let listingOrder: any = null;
    if (aliceStarter.length > 0) {
      listingOrder = await this.marketSvc.createListing({
        fantasyLeagueId: league.id,
        ownerTeamId: teamAId,
        playerId: aliceStarter[0].player_id,
        minPrice: 2_000_000,
      });
    }

    return {
      managers: { alice: mgrA, bob: mgrB },
      league: { id: league.id, inviteCode: league.inviteCode },
      teams: { teamAId, teamBId },
      rosterA: await this.teamsSvc.getRoster(teamAId),
      rosterB: await this.teamsSvc.getRoster(teamBId),
      auctionOrder,
      bid,
      listingOrder,
      nextSteps: {
        freeAgents: `GET /fantasy/teams/free-agents/${league.id}`,
        bidExample: auctionOrder ? `POST /fantasy/market/bid {"marketOrderId":${auctionOrder.id},"bidderTeamId":${teamAId},"amount":2000000}` : 'No hay AUCTION (no había libres)',
        closeAuctions: `POST /fantasy/market/close?leagueId=${league.id} (o espera al scheduler)`,
        createListingExample: aliceStarter.length ? `POST /fantasy/market/listing {"fantasyLeagueId":${league.id},"ownerTeamId":${teamAId},"playerId":${aliceStarter[0].player_id},"minPrice":2500000}` : 'No hay titular de Alice',
      },
    };
  }
}