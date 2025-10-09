// src/fantasy/leagues/fantasy-leagues.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { FantasyLeague } from './fantasy-league.entity';
import { FantasyManager } from './fantasy-manager.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { CreateFantasyLeagueDto } from './dto/create-fantasy-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { T } from '../../database/schema.util';
import { Tournament } from 'src/entities/tournament.entity';

function genInviteCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

@Injectable()
export class FantasyLeaguesService {
  constructor(
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectRepository(FantasyManager) private managers: Repository<FantasyManager>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  async createLeague(adminManagerId: number, dto: CreateFantasyLeagueDto) {
    const admin = await this.managers.findOne({ where: { id: adminManagerId } });
    if (!admin) throw new BadRequestException('Manager no existe');

    const invite = genInviteCode();
    const league = this.leagues.create({
      name: dto.name,
      inviteCode: invite,
      adminManager: admin,
      initialBudget: String(dto.initialBudget ?? 100_000_000),
      clauseMultiplier: String(dto.clauseMultiplier ?? 1.5),
      marketCloseTime: dto.marketCloseTime ?? '20:00',
      timezone: dto.timezone ?? 'Europe/Madrid',
      scoringConfig: dto.scoringConfig ?? { kill: 3, assist: 2, death: -1, cs10: 0.5, win: 2 },
      rosterConfig: dto.rosterConfig ?? { slots: ['TOP', 'JNG', 'MID', 'ADC', 'SUP'], bench: 2 },
      sourceLeagueCode: dto.sourceLeagueCode?.toUpperCase() ?? null,
      sourceLeagueId: (dto as any).sourceLeagueId ?? null,
    });
    // Normalizar league id/code
    if (league.sourceLeagueId) {
      const [core] = await this.ds.query(`SELECT id, code FROM public.league WHERE id = $1`, [league.sourceLeagueId]);
      if (core) league.sourceLeagueCode = (core.code || league.sourceLeagueCode || '').toUpperCase() || null;
    } else if (league.sourceLeagueCode) {
      const [core] = await this.ds.query(`SELECT id, code FROM public.league WHERE code ILIKE $1 LIMIT 1`, [league.sourceLeagueCode]);
      if (core?.id) {
        league.sourceLeagueId = Number(core.id);
        league.sourceLeagueCode = (core.code || league.sourceLeagueCode).toUpperCase();
      }
    }
    // Nuevo modelo: no fijamos source_tournament_id (abarca todos los torneos de esa liga)
    return this.leagues.save(league);
  }

  async joinLeague(dto: JoinLeagueDto) {
    return this.ds.transaction(async (trx) => {
      const league = await trx.findOne(FantasyLeague, { where: { inviteCode: dto.inviteCode } });
      if (!league) throw new BadRequestException('Invite code inválido');

      const mgr = await trx.findOne(FantasyManager, { where: { id: dto.fantasyManagerId } });
      if (!mgr) throw new BadRequestException('Manager inválido');

      const exists = await trx.findOne(FantasyTeam, {
        where: {
          fantasyLeague: { id: league.id } as any,
          fantasyManager: { id: mgr.id } as any,
        },
      });
      if (exists) throw new BadRequestException('Ya estás en esta liga');

      const team = trx.create(FantasyTeam, {
        fantasyLeague: league,
        fantasyManager: mgr,
        name: dto.teamName,
        budgetRemaining: String(league.initialBudget),
        budgetReserved: '0',
        pointsTotal: '0',
      });
      await trx.save(team);
      return { leagueId: league.id, teamId: team.id, budgetRemaining: team.budgetRemaining };
    });
  }

  async ranking(leagueId: number) {
    // IMPORTANTE:
    // - Estas tablas son "fantasy_*" => deben resolver en el esquema activo (DB_SCHEMA),
    //   por eso usamos T('tabla') en vez de "public.".
    // - Las tablas core se mantendrían con "public." si las usáramos aquí (no es el caso).
    const rows = await this.ds.query(
      `
      SELECT ft.id, ft.name, ft.points_total, fm.display_name
      FROM ${T('fantasy_team')} ft
      JOIN ${T('fantasy_manager')} fm ON fm.id = ft.fantasy_manager_id
      WHERE ft.fantasy_league_id = $1
      ORDER BY ft.points_total DESC, ft.name ASC
      `,
      [leagueId],
    );
    return rows;
  }

  async updateLeague(leagueId: number, dto: UpdateLeagueDto) {
    const league = await this.leagues.findOne({ where: { id: leagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');
    Object.assign(league, {
      name: dto.name ?? league.name,
      timezone: dto.timezone ?? league.timezone,
      marketCloseTime: dto.marketCloseTime ?? league.marketCloseTime,
      clauseMultiplier: dto.clauseMultiplier?.toString() ?? league.clauseMultiplier,
      scoringConfig: dto.scoringConfig ?? league.scoringConfig,
      rosterConfig: dto.rosterConfig ?? league.rosterConfig,
      sourceLeagueCode: dto.sourceLeagueCode?.toUpperCase() ?? league.sourceLeagueCode,
    });
    // Normalizar cambios en league id/code y borrar torneo
    if ((dto as any).sourceLeagueId) {
      const [core] = await this.ds.query(`SELECT id, code FROM public.league WHERE id = $1`, [(dto as any).sourceLeagueId]);
      if (core) {
        league.sourceLeagueId = Number(core.id);
        league.sourceLeagueCode = (core.code || league.sourceLeagueCode || '').toUpperCase() || null;
      }
    } else if (dto.sourceLeagueCode) {
      const [core] = await this.ds.query(`SELECT id, code FROM public.league WHERE code ILIKE $1 LIMIT 1`, [dto.sourceLeagueCode.toUpperCase()]);
      if (core?.id) {
        league.sourceLeagueId = Number(core.id);
        league.sourceLeagueCode = (core.code || dto.sourceLeagueCode).toUpperCase();
      }
    }
    return this.leagues.save(league);
  }

  async updateEconomicConfig(leagueId: number, partial: any) {
    const league = await this.leagues.findOne({ where: { id: leagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');
    const current = (league as any).economicConfig || {};
    const merged = { ...current, ...partial };
    (league as any).economicConfig = merged;
    await this.leagues.save(league);
    return { ok: true, economicConfig: merged };
  }

  /**
   * Devuelve el ciclo de mercado abierto (o el último creado si ninguno abierto) con sus órdenes y top bids.
   */
  async getCurrentMarket(leagueId: number) {
    // ciclo más reciente
    const [cycle] = await this.ds.query(
      `SELECT id, opens_at, closes_at FROM ${T('market_cycle')} WHERE fantasy_league_id=$1 ORDER BY id DESC LIMIT 1`,
      [leagueId],
    );
    if (!cycle) return { cycle: null, orders: [], serverTime: new Date().toISOString() };

    // órdenes del ciclo con highest bid y minNextBid
    const orders = await this.ds.query(
      `WITH topb AS (
         SELECT mb.market_order_id,
                MAX(mb.amount::bigint) AS top_amount
           FROM ${T('market_bid')} mb
          GROUP BY mb.market_order_id
       )
       SELECT mo.id AS order_id,
              mo.player_id::bigint AS player_id,
              COALESCE(tb.top_amount, 0)::bigint AS highest_bid,
              CASE WHEN COALESCE(tb.top_amount,0) > 0 THEN (tb.top_amount + 1)::bigint ELSE GREATEST(mo.min_price::bigint, 1)::bigint END AS min_next_bid
         FROM ${T('market_order')} mo
         LEFT JOIN topb tb ON tb.market_order_id = mo.id
        WHERE mo.cycle_id = $1
        ORDER BY mo.id ASC`,
      [cycle.id],
    );
    return {
      cycle: { id: cycle.id, opensAt: cycle.opens_at, closesAt: cycle.closes_at },
      orders,
      serverTime: new Date().toISOString(),
    };
  }

  async getLeagueSummary(leagueId: number, topN = 10) {
    // Ranking top N
    const ranking = await this.ds.query(
      `SELECT ft.id, ft.name, ft.points_total::float AS points, fm.display_name
       FROM ${T('fantasy_team')} ft
       JOIN ${T('fantasy_manager')} fm ON fm.id = ft.fantasy_manager_id
       WHERE ft.fantasy_league_id = $1
       ORDER BY ft.points_total DESC, ft.id ASC
       LIMIT $2`,
      [leagueId, topN],
    );

    // Próximo cierre de mercado (orden o ciclo)
    const [nextOrder] = await this.ds.query(
      `SELECT closes_at FROM ${T('market_order')} WHERE fantasy_league_id = $1 AND status = 'OPEN' ORDER BY closes_at ASC LIMIT 1`,
      [leagueId],
    );
    const [lastCycle] = await this.ds.query(
      `SELECT id, opens_at, closes_at FROM ${T('market_cycle')} WHERE fantasy_league_id = $1 ORDER BY id DESC LIMIT 1`,
      [leagueId],
    );

    // Últimos movimientos de ledger (global liga)
    const ledger = await this.ds.query(
      `SELECT id, fantasy_team_id, type, delta::bigint AS delta, balance_after::bigint AS balance_after, metadata, created_at
       FROM ${T('fantasy_budget_ledger')}
       WHERE fantasy_league_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [leagueId],
    );

    return {
      ranking,
      market: {
        nextCloseAt: nextOrder?.closes_at ?? lastCycle?.closes_at ?? null,
        cycle: lastCycle ? { id: lastCycle.id, opensAt: lastCycle.opens_at, closesAt: lastCycle.closes_at } : null,
      },
      ledger,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Selecciona el torneo "activo" más reciente para la liga (split actual) y cachea datos.
   * Criterio: tournament.league ILIKE code% AND date_start <= today AND (date_end IS NULL OR date_end >= today)
   * Fallback: más reciente por date_start.
   */
  private async assignActiveTournament(league: FantasyLeague) {
    const repo = this.ds.getRepository(Tournament);
    let code = league.sourceLeagueCode?.toUpperCase() || null;

    // Resolver datos de liga core si tenemos id o code
    let coreLeagueName: string | null = null;
    if (league.sourceLeagueId) {
      const [core] = await this.ds.query(`SELECT name, code FROM public.league WHERE id = $1`, [league.sourceLeagueId]);
      if (core) {
        coreLeagueName = core.name;
        if (!code && core.code) code = String(core.code).toUpperCase();
        league.sourceLeagueCode = code ?? league.sourceLeagueCode;
      }
    }
    if (!league.sourceLeagueId && code) {
      const [core2] = await this.ds.query(`SELECT id, name, code FROM public.league WHERE code ILIKE $1 LIMIT 1`, [code]);
      if (core2?.id) {
        league.sourceLeagueId = Number(core2.id);
        coreLeagueName = core2.name || coreLeagueName;
        league.sourceLeagueCode = (core2.code || code).toUpperCase();
      }
    }

    // Construir query por code/prefijo siempre que haya code
    let qb = repo.createQueryBuilder('t').where('(t.is_official IS NULL OR t.is_official = true)');
    if (code) {
      qb = qb.andWhere('(t.league = :code OR t.league ILIKE :lg OR t.league_icon_key ILIKE :lg)', { code, lg: `${code}%` });
    } else if (coreLeagueName) {
      qb = qb.andWhere('t.league = :lname', { lname: coreLeagueName });
    }

    let active: Tournament | null = await qb
      .orderBy('t.date_start', 'DESC', 'NULLS LAST')
      .addOrderBy('t.id', 'DESC')
      .addOrderBy('t.createdAt', 'DESC')
      .getOne();

    // Fallback global: tomar el más reciente oficial si no hay ninguno filtrado
    if (!active) {
      active = await repo.createQueryBuilder('t')
        .where('(t.is_official IS NULL OR t.is_official = true)')
        .orderBy('t.date_start', 'DESC', 'NULLS LAST')
        .addOrderBy('t.id', 'DESC')
        .addOrderBy('t.createdAt', 'DESC')
        .getOne();
      if (active && !code) {
        code = this.deriveLeagueCodeFromTournament(active) || null;
        league.sourceLeagueCode = code ?? null;
      }
    }

    // Nuevo modelo: ya no persistimos torneo; sólo aseguramos code/league id.
    // (Si se requiere metadata del split activo, podría devolverse ad-hoc sin columnas dedicadas.)
  }

  /**
   * Intenta derivar un nombre legible cuando el torneo no trae 'name'.
   * Estrategias:
   *  - Limpiar overview_page (reemplazar underscores por espacios, quitar sufijos como ' Season')
   *  - Capitalizar tokens básicos.
   */
  private deriveTournamentName(t: Partial<Tournament>): string | null {
    if (!t?.overviewPage) return null;
    let base = t.overviewPage; // Ej: 'LEC/2025 Season/Winter Playoffs'
    // Tomar la última parte tras '/'
    const parts = base.split('/').filter(Boolean);
    if (parts.length) base = parts[parts.length - 1];
    base = base.replace(/_/g, ' ').trim();
    // Reemplazos menores
    base = base.replace(/\bSeason\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    // Capitalizar primeras letras (simple)
    base = base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return base || null;
  }

  /** Deriva el año a partir de date_start si existe y no hay year. */
  private deriveTournamentYear(t: Partial<Tournament>): number | null {
    if (t?.year) return t.year;
    // @ts-ignore (TypeORM entity may not expose directly) - we rely on raw columns existing
    const ds: string | undefined = (t as any).dateStart || (t as any).date_start;
    if (!ds) return null;
    const d = new Date(ds + (ds.length === 10 ? 'T00:00:00Z' : ''));
    if (isNaN(d.getTime())) return null;
    return d.getUTCFullYear();
  }

  /** Deriva un league code (LEC, LCK, LPL, LCS, etc.) a partir del torneo. */
  private deriveLeagueCodeFromTournament(t: Partial<Tournament>): string | null {
    const icon = (t as any).leagueIconKey || (t as any).league_icon_key;
    if (icon && /^[A-Za-z]{2,5}$/.test(icon)) return String(icon).toUpperCase();
    const name = (t as any).league || '';
    const MAP: Record<string, string> = {
      'LoL EMEA Championship': 'LEC',
      'LoL Champions Korea': 'LCK',
      'Tencent LoL Pro League': 'LPL',
    };
    if (MAP[name]) return MAP[name];
    // Heurística: tomar iniciales de palabras con mayúscula (filtrando muy cortas)
    const initials = name
      .split(/\s+/)
      .filter(w => /[A-Za-z]/.test(w))
      .map(w => w[0])
      .join('');
    if (initials.length >= 2 && initials.length <= 5) return initials.toUpperCase();
    return null;
  }
}