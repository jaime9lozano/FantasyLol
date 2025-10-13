// src/fantasy/leagues/fantasy-leagues.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, Repository, EntityManager } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { FantasyLeague } from './fantasy-league.entity';
import { FantasyManager } from './fantasy-manager.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { CreateFantasyLeagueDto } from './dto/create-fantasy-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { T } from '../../database/schema.util';
import { Tournament } from 'src/entities/tournament.entity';
import { MarketService } from '../market/market.service';

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
    private readonly market: MarketService,
  ) {}

  async createLeague(adminManagerId: number, dto: CreateFantasyLeagueDto) {
    const admin = await this.managers.findOne({ where: { id: adminManagerId } });
    if (!admin) throw new BadRequestException('Manager no existe');

    const invite = genInviteCode();
    // Si no se especifica hora de cierre, usar la hora actual (HH:mm) para que rote cada día a esta hora
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const defaultClose = `${hh}:${mm}`;
    const league = this.leagues.create({
      name: dto.name,
      inviteCode: invite,
      adminManager: admin,
      initialBudget: String(dto.initialBudget ?? 100_000_000),
      clauseMultiplier: String(dto.clauseMultiplier ?? 1.5),
      marketCloseTime: dto.marketCloseTime ?? defaultClose,
      timezone: dto.timezone ?? 'Europe/Madrid',
      scoringConfig: dto.scoringConfig ?? { kill: 3, assist: 2, death: -1, cs10: 0.5, win: 2 },
      rosterConfig: dto.rosterConfig ?? { slots: ['TOP', 'JNG', 'MID', 'ADC', 'SUP'], bench: 2 },
      economicConfig: (dto as any).economicConfig ?? {
        valuation: {
          min: 1_000_000,
          hardCap: 200_000_000,
          linearBase: 250_000,
          linearPerPoint: 180_000,
          quadraticThreshold: 20,
          quadraticFactor: 50_000,
        },
        dampening: { baseDivisor: 1, perPeriod: 0.1, maxFactor: 4 },
        inactivity: { periodsWithoutGameForDecay: 2, decayPercentPerExtraPeriod: 0.10, maxDecayPercent: 0.50 },
      },
      sourceLeagueCode: dto.sourceLeagueCode?.toUpperCase() ?? null,
      sourceLeagueId: (dto as any).sourceLeagueId ?? null,
    });
    // Normalizar league id/code
    if (league.sourceLeagueId) {
      const [core] = await this.ds.query(`SELECT id, code FROM public.league WHERE id = $1`, [league.sourceLeagueId]);
      if (core) league.sourceLeagueCode = (core.code || league.sourceLeagueCode || '').toUpperCase() || null;
    } else if (league.sourceLeagueCode) {
      const code = league.sourceLeagueCode.toUpperCase();
      const isBase3 = /^[A-Z]{3}$/.test(code); // LCK/LEC/LPL
      let core: any | undefined;
      if (isBase3) {
        // Match exacto sólo para evitar LCK CL cuando piden LCK
        [core] = await this.ds.query(
          `SELECT id, code FROM public.league WHERE code = $1 LIMIT 1`,
          [code],
        );
      } else {
        // Temporada: permitir prefijo (LCK21, LPL2020, etc.)
        [core] = await this.ds.query(
          `SELECT id, code FROM public.league WHERE code ILIKE $1 LIMIT 1`,
          [`${code}%`],
        );
      }
      if (core?.id) {
        league.sourceLeagueId = Number(core.id);
        league.sourceLeagueCode = (core.code || code).toUpperCase();
      } else {
        // Intento 2: usar torneos para derivar el code/id cuando el code incluye año
        await this.assignActiveTournament(league);
      }
    }
    // Nuevo modelo: no fijamos source_tournament_id (abarca todos los torneos de esa liga)
    const saved = await this.leagues.save(league);
    // Iniciar primer ciclo de mercado automáticamente (6 jugadores, 24h) si aún no existe
    try {
      await this.market.cancelOpenOrdersForConflicts(Number(saved.id));
      await this.market.startNewCycle(Number(saved.id), 6);
    } catch (e) {
      // no bloquear creación de liga por fallo al iniciar ciclo
    }
    return saved;
  }

  async joinLeague(fantasyManagerId: number, dto: JoinLeagueDto) {
    return this.ds.transaction(async (trx) => {
      const league = await trx.findOne(FantasyLeague, { where: { inviteCode: dto.inviteCode } });
      if (!league) throw new BadRequestException('Invite code inválido');

      const mgr = await trx.findOne(FantasyManager, { where: { id: fantasyManagerId } });
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
      // Auto-asignar plantilla inicial: 5 titulares + 1 bench (solo jugadores actuales de la liga base)
      try {
        await this.autoAssignInitialRoster(trx, Number(league.id), Number(team.id));
      } catch (e) {
        // Log suave sin romper el flujo de unión a liga
        // console.warn('No se pudo autoasignar plantilla inicial:', (e as Error).message);
      }
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
    let [cycle] = await this.ds.query(
      `SELECT id, opens_at, closes_at FROM ${T('market_cycle')} WHERE fantasy_league_id=$1 ORDER BY id DESC LIMIT 1`,
      [leagueId],
    );

    // Lazy self-heal: si el último ciclo está vencido (o no hay), rotar ahora mismo.
    const now = new Date();
    if (!cycle || (cycle?.closes_at && new Date(cycle.closes_at) <= now)) {
      try {
        await this.market.settleAndRotate(leagueId, now);
      } catch {}
      const [fresh] = await this.ds.query(
        `SELECT id, opens_at, closes_at FROM ${T('market_cycle')} WHERE fantasy_league_id=$1 ORDER BY id DESC LIMIT 1`,
        [leagueId],
      );
      if (fresh) cycle = fresh;
    }
    if (!cycle) return { cycle: null, orders: [], serverTime: new Date().toISOString() };

    // órdenes del ciclo con highest bid y minNextBid
    const orders = await this.ds.query(
      `WITH topb AS (
         SELECT mb.market_order_id,
                MAX(mb.amount::bigint) AS top_amount
           FROM ${T('market_bid')} mb
          GROUP BY mb.market_order_id
       ), bidders AS (
         SELECT market_order_id, COUNT(DISTINCT bidder_team_id)::int AS bidders_count
           FROM ${T('market_bid')}
          GROUP BY market_order_id
       ), pv AS (
         SELECT player_id, current_value::bigint AS v
           FROM ${T('fantasy_player_valuation')}
          WHERE fantasy_league_id = (SELECT fantasy_league_id FROM ${T('market_cycle')} WHERE id = $1)
       )
       SELECT mo.id AS order_id,
              mo.player_id::bigint AS player_id,
              p.display_name AS player_name,
              COALESCE(tb.top_amount, 0)::bigint AS highest_bid,
              COALESCE(b.bidders_count, 0)::int AS bidders_count,
              COALESCE(pv.v, 0)::bigint AS valuation,
              CASE WHEN COALESCE(tb.top_amount,0) > 0 THEN (tb.top_amount + 1)::bigint ELSE GREATEST(mo.min_price::bigint, 1000000)::bigint END AS min_next_bid
         FROM ${T('market_order')} mo
         LEFT JOIN topb tb ON tb.market_order_id = mo.id
         LEFT JOIN bidders b ON b.market_order_id = mo.id
         LEFT JOIN pv ON pv.player_id = mo.player_id
         JOIN public.player p ON p.id = mo.player_id
        WHERE mo.cycle_id = $1 AND mo.status = 'OPEN'
        ORDER BY mo.id ASC`,
      [cycle.id],
    );
    return {
      cycle: { id: cycle.id, opensAt: cycle.opens_at, closesAt: cycle.closes_at },
      orders,
      serverTime: new Date().toISOString(),
    };
  }

  async getLeagueSummary(leagueId: number, topN = 10, yourTeamId?: number) {
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

    // Próximos cierres de mercado (órdenes abiertas) y último ciclo
    const nextOrders = await this.ds.query(
      `SELECT closes_at FROM ${T('market_order')} WHERE fantasy_league_id = $1 AND status = 'OPEN' ORDER BY closes_at ASC LIMIT 5`,
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

    // Tu equipo (posición, puntos, presupuesto) si se provee teamId
    let yourTeam: any = null;
    if (yourTeamId) {
      const [row] = await this.ds.query(
        `WITH ranked AS (
           SELECT ft.id,
                  ft.name,
                  ft.points_total::float AS points,
                  ft.budget_remaining::bigint AS budget_remaining,
                  ft.budget_reserved::bigint AS budget_reserved,
                  RANK() OVER (ORDER BY ft.points_total DESC, ft.id ASC) AS pos
           FROM ${T('fantasy_team')} ft
           WHERE ft.fantasy_league_id = $1
         )
         SELECT id, name, points, budget_remaining, budget_reserved, pos
         FROM ranked WHERE id = $2`,
        [leagueId, yourTeamId],
      );
      if (row) {
        yourTeam = {
          id: Number(row.id),
          name: row.name,
          position: Number(row.pos),
          points: Number(row.points),
          budgetRemaining: Number(row.budget_remaining),
          budgetReserved: Number(row.budget_reserved),
        };
      }
    }

    return {
      ranking,
      market: {
        nextCloseAt: nextOrders?.[0]?.closes_at ?? lastCycle?.closes_at ?? null,
        nextCloses: nextOrders?.map((o: any) => o.closes_at) ?? [],
        cycle: lastCycle ? { id: lastCycle.id, opensAt: lastCycle.opens_at, closesAt: lastCycle.closes_at } : null,
      },
      yourTeam,
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

  /** Asigna 6 jugadores al equipo: TOP/JNG/MID/ADC/SUP titulares + 1 BENCH. */
  private async autoAssignInitialRoster(qr: EntityManager, leagueId: number, teamId: number): Promise<void> {
      const [lg] = await qr.query(`SELECT source_league_id FROM ${T('fantasy_league')} WHERE id = $1`, [leagueId]);
      const sourceLeagueId: number | null = lg?.source_league_id ? Number(lg.source_league_id) : null;
      // Endurecer: si no hay liga core, no auto-asignar
      if (!sourceLeagueId) {
        // console.info(`[Fantasy] Liga ${leagueId} sin sourceLeagueId: no se auto-asigna roster`);
        return;
      }

      const taken = await qr.query(
        `SELECT player_id::bigint AS player_id FROM ${T('fantasy_roster_slot')} WHERE fantasy_league_id = $1 AND active = true`,
        [leagueId],
      );
      const takenIds = new Set<number>(taken.map((r: any) => Number(r.player_id)));

      // Excluir también jugadores que ya están en órdenes de mercado abiertas
      const openOrders = await qr.query(
        `SELECT player_id::bigint AS player_id FROM ${T('market_order')} WHERE fantasy_league_id = $1 AND status = 'OPEN'`,
        [leagueId],
      );
      for (const r of openOrders) takenIds.add(Number(r.player_id));

      type CoreRole = 'TOP' | 'JNG' | 'MID' | 'ADC' | 'SUP';

      async function fetchCandidatesByRole(target: CoreRole): Promise<number[]> {
        const rows = await qr.query(
          `
          WITH roles AS (
            SELECT p.id::bigint AS id,
                   UPPER(
                     CASE r.code
                       WHEN 'JUNGLE'  THEN 'JNG'
                       WHEN 'SUPPORT' THEN 'SUP'
                       WHEN 'BOT'     THEN 'ADC'
                       WHEN 'BOTTOM'  THEN 'ADC'
                       ELSE COALESCE(r.code, 'FLEX')
                     END
                   ) AS role_norm
            FROM public.player p
            JOIN public.team_player_membership tpm ON tpm.player_id = p.id AND tpm.is_current = true
            JOIN public.team t ON t.id = tpm.team_id AND t.league_id = $2
            LEFT JOIN public.role r ON r.id = tpm.main_role_id
          ),
          agg AS (
            SELECT id, role_norm, COUNT(*) AS c,
                   ROW_NUMBER() OVER (
                     PARTITION BY id
                     ORDER BY COUNT(*) DESC,
                       CASE role_norm
                         WHEN 'TOP' THEN 1
                         WHEN 'JNG' THEN 2
                         WHEN 'MID' THEN 3
                         WHEN 'ADC' THEN 4
                         WHEN 'SUP' THEN 5
                         ELSE 6
                       END
                   ) AS rn
            FROM roles
            GROUP BY id, role_norm
          )
          SELECT id FROM agg WHERE rn = 1 AND role_norm = $1 ORDER BY random() LIMIT 1000
          `,
          [target, sourceLeagueId],
        );
        return rows.map((r: any) => Number(r.id));
      }

      async function pickByRole(target: CoreRole): Promise<number | null> {
        const ids = await fetchCandidatesByRole(target);
        for (const id of ids) {
          if (!takenIds.has(id)) { takenIds.add(id); return id; }
        }
        return null;
      }

      async function pickAny(): Promise<number | null> {
        const rows = await qr.query(
          `SELECT p.id::bigint AS id
           FROM public.player p
           JOIN public.team_player_membership tpm ON tpm.player_id = p.id AND tpm.is_current = true
           JOIN public.team t ON t.id = tpm.team_id AND t.league_id = $1
           ORDER BY random()
           LIMIT 2000`,
          [sourceLeagueId],
        );
        for (const r of rows) {
          const id = Number(r.id);
          if (!takenIds.has(id)) { takenIds.add(id); return id; }
        }
        return null;
      }

      const desired: CoreRole[] = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
      const picks: { player_id: number; slot: string; starter: boolean }[] = [];
      for (const slot of desired) {
        const picked = (await pickByRole(slot)) ?? (await pickAny());
        if (!picked) throw new Error(`No hay jugadores suficientes para ${slot}`);
        picks.push({ player_id: picked, slot, starter: true });
      }
      const bench = await pickAny();
      if (!bench) throw new Error('No hay jugador disponible para BENCH');
      picks.push({ player_id: bench, slot: 'BENCH', starter: false });

      for (const p of picks) {
        await qr.query(
          `INSERT INTO ${T('fantasy_roster_slot')}
             (fantasy_league_id, fantasy_team_id, player_id, slot, starter, active,
              acquisition_price, clause_value, valid_from, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true,
                   (1000000)::bigint, (1500000)::bigint, now(), now(), now())`,
          [leagueId, teamId, p.player_id, p.slot, p.starter],
        );
        await qr.query(
          `INSERT INTO ${T('fantasy_player_valuation')}
             (fantasy_league_id, player_id, current_value, last_change, calc_date)
           VALUES ($1, $2, (1000000)::bigint, 0, now()::date)
           ON CONFLICT (fantasy_league_id, player_id) DO UPDATE
             SET current_value = EXCLUDED.current_value,
                 updated_at    = now(),
                 calc_date     = EXCLUDED.calc_date`,
          [leagueId, p.player_id],
        );
      }
  }
}