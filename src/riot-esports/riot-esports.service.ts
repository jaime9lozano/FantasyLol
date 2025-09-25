import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { EsportsLeague } from 'src/esports_league/entities/esports_league.entity';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Jugador } from 'src/jugador/entities/jugador.entity';
import { Rol } from 'src/rol/entities/rol.entity';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { LeaguepediaService } from 'src/leaguepedia/leaguepedia.service';

@Injectable()
export class RiotEsportsService {
  private readonly baseUrl = process.env.ESPORTS_API_URL;
  private readonly apiKey = process.env.ESPORTS_API_KEY;
  private readonly DEFAULT_REGION_ID = Number(process.env.DEFAULT_REGION_ID ?? 1);
  private readonly DEFAULT_ROLE_ID = Number(process.env.DEFAULT_ROLE_ID ?? 1);

  private readonly logger = new Logger(RiotEsportsService.name);

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(EsportsLeague)
    private readonly leagueRepo: Repository<EsportsLeague>,
    @InjectRepository(Equipo)
    private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Jugador)
    private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(Rol)
    private readonly rolRepo: Repository<Rol>,
    private readonly leaguepedia: LeaguepediaService,
  ) {}

  /** Header para API leaguepedia */
  private readonly DEFAULT_WINDOW = { pastDays: 70, futureDays: 28 };
  private readonly LEAGUE_WHITELIST = ['lck','lpl','lec','lcs'];

  private async getActiveTeamSlugsFromSchedule(leagueId: string, window = this.DEFAULT_WINDOW): Promise<Set<string>> {
    const url = `${this.baseUrl}/getSchedule`;
    const data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US', leagueId } });

    const now = new Date();
    const min = new Date(now.getTime() - window.pastDays * 86400000);
    const max = new Date(now.getTime() + window.futureDays * 86400000);

    const events: any[] = data?.data?.schedule?.events ?? [];
    const slugs = new Set<string>();

    for (const ev of events) {
      const ts = ev?.startTime || ev?.blockStart || data?.data?.schedule?.updated;
      const dt = ts ? new Date(ts) : now;
      if (dt >= min && dt <= max) {
        const teams = ev?.match?.teams || [];
        for (const t of teams) {
          if (t?.slug) slugs.add(t.slug);
        }
      }
    }
    return slugs;
  }

  private async fetchTeamsBySlugs(slugs: string[], chunkSize = 20): Promise<any[]> {
    const url = `${this.baseUrl}/getTeams`;
    const out: any[] = [];
    for (let i = 0; i < slugs.length; i += chunkSize) {
      const batch = slugs.slice(i, i + chunkSize);
      const data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US', id: batch } });
      const teams = data?.data?.teams ?? [];
      out.push(...teams);
    }
    return out;
  }

  /** Headers por defecto para la API de LoLEsports */
  private getHeaders() {
    return { 'x-api-key': this.apiKey };
  }

  // ----------------------------------------------------------------------------
  // Helper HTTP con reintentos + backoff y headers inyectados por defecto
  // ----------------------------------------------------------------------------
  private async requestWithRetry<T>(
    url: string,
    config: any = {},
    tries = 3,
    delayMs = 800,
  ): Promise<T> {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const res = await firstValueFrom(
          this.httpService.get<T>(url, {
            headers: this.getHeaders(), // <--- inyecta headers por defecto
            timeout: 15_000,
            ...config,                  // puedes sobreescribir headers/params si quieres
          }),
        );
        return res.data as T;
      } catch (err: any) {
        const status = err?.response?.status;
        const body = err?.response?.data;
        this.logger.warn(
          `HTTP ${status || 'ERR'} calling ${url} (try ${attempt}/${tries}). Body: ${
            typeof body === 'object'
              ? JSON.stringify(body).slice(0, 300)
              : String(body).slice(0, 300)
          }`,
        );
        // reintentar en 429/5xx o si no hay status (timeout/conexión)
        if (status === 429 || status >= 500 || !status) {
          await new Promise((r) => setTimeout(r, delayMs * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed after ${tries} tries`);
  }

  
    /** Slug “limpio”: trim → null si vacío/placeholder. */
    private readonly PLACEHOLDER_SLUGS = new Set([
      'tbd', 'tba', 'unknown', 'team', 'placeholder', 'none', 'null'
    ]);

    private sanitizeSlug(input?: string | null): string | null {
      if (!input) return null;
      const s = input.trim();
      if (!s) return null;
      if (this.PLACEHOLDER_SLUGS.has(s.toLowerCase())) return null;
      return s;
    }

    /** String seguro (o null si vacío/undefined) */
    private toStr(v: any): string | null {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    }

  // ===========
  //   LEAGUES
  // ===========
  async getLeagues(): Promise<any[]> {
    const url = `${this.baseUrl}/getLeagues`;
    const data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US' } });
    return data?.data?.leagues ?? [];
  }

  async upsertLeagues(): Promise<void> {
    const leagues = await this.getLeagues();
    for (const league of leagues) {
      await this.leagueRepo.upsert(
        {
          // OJO: aquí estás usando el id externo como PK interno (válido si tu schema lo define así)
          id: league.id,
          slug: league.slug,
          name: league.name,
          region: league.region,
          image_url: league.image,
        },
        ['id'],
      );
    }
    this.logger.log(`Actualizadas ${leagues.length} ligas`);
  }

  // ===========
  //   TEAMS (smart)
  // ===========
  /**
   * Algunas variantes de /getTeams esperan:
   *  - id = leagueId (a veces también team slug)
   *  - leagueId = leagueId
   *  Si nada devuelve equipos, hace fallback a traer todos y filtra por homeLeague/league.
   */
  private async getTeamsForLeagueSmart(league: { id: string; slug?: string }): Promise<any[]> {
    const url = `${this.baseUrl}/getTeams`;

    // 1) id = league.id
    let data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US', id: league.id } });
    let teams: any[] = data?.data?.teams ?? [];
    if (teams.length > 0) return teams;

    // 2) leagueId = league.id
    data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US', leagueId: league.id } });
    teams = data?.data?.teams ?? [];
    if (teams.length > 0) return teams;

    // 3) id = league.slug
    if (league.slug) {
      data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US', id: league.slug } });
      teams = data?.data?.teams ?? [];
      if (teams.length > 0) return teams;
    }

    // 4) Fallback: todos los equipos -> filtrar por homeLeague/league info si existe
    data = await this.requestWithRetry<any>(url, { params: { hl: 'en-US' } });
    teams = data?.data?.teams ?? [];
    if (teams.length > 0) {
      const filtered = teams.filter((t: any) => {
        const hl = t?.homeLeague || t?.league || t?.leagues?.[0]; // distintos payloads
        return (
          (hl?.id && String(hl.id) === String(league.id)) ||
          (hl?.slug && league.slug && hl.slug === league.slug)
        );
      });
      if (filtered.length > 0) return filtered;
    }

    this.logger.warn(
      `getTeams: sin resultados para league=${league.slug || league.id} (probadas variantes id/leagueId/slug/fallback)`,
    );
    return [];
  }

  // ===========
  //  HELPERS Roles
  // ===========
  /** Normaliza el rol exactamente a los 5 valores de tu BD (Title Case). */
    private normalizeRole(
      role?: string,
    ): 'Top' | 'Jungle' | 'Mid' | 'Adc' | 'Support' | null {
      if (!role) return null;
      const r = role.trim().toLowerCase();
      switch (r) {
        case 'top':
          return 'Top';
        case 'jungle':
          return 'Jungle';
        case 'mid':
          return 'Mid';
        case 'adc':
          return 'Adc';
        case 'support':
          return 'Support';
        default:
          return null; // cualquier otro valor se ignora y caerá al DEFAULT_ROLE_ID
      }
    }

private rolesCache: Map<string, number> | null = null;

private buildRolesCache = async () => {
  if (this.rolesCache) return this.rolesCache;
  const all = await this.rolRepo.find(); // columns: id, rol, eliminated
  const map = new Map<string, number>();
  for (const r of all) {
    if (!r?.rol) continue;
    map.set(r.rol.trim().toUpperCase(), Number(r.id));
  }
  this.rolesCache = map;
  return this.rolesCache;
};

private async mapRoleToId(role?: string): Promise<number> {
  const norm = this.normalizeRole(role); // → TOP/JUNGLE/MID/ADC/SUPPORT o null
  const cache = await this.buildRolesCache();
  if (!norm) return this.DEFAULT_ROLE_ID;

  // candidatos: EN + ES
  const candidates = new Set<string>([norm]);
  switch (norm) {
    case 'Top': candidates.add('TOP').add('SUPERIOR'); break;
    case 'Jungle': candidates.add('JUNGLE').add('JUNGLA').add('JG'); break;
    case 'Mid': candidates.add('MID').add('CENTRAL').add('MEDIO'); break;
    case 'Adc': candidates.add('ADC').add('TIRADOR').add('BOT').add('BOTTOM'); break;
    case 'Support': candidates.add('SUPPORT').add('SOPORTE').add('APOYO').add('SUP'); break;
  }

  for (const c of candidates) {
    const id = cache.get(c);
    if (id) return id;
  }
  this.logger.warn(`Rol "${norm}" no encontrado en cache. Usando DEFAULT_ROLE_ID=${this.DEFAULT_ROLE_ID}`);
  return this.DEFAULT_ROLE_ID;
}

  private async resolveRegionId(homeRegion?: string, leagueRegion?: string): Promise<number> {
    // TODO: si quieres, mapear a tu tabla Region (code/slug/name). Por ahora: default.
    return this.DEFAULT_REGION_ID;
  }

    /** Convierte roles de Leaguepedia a valores esperados por normalizeRole/mapRoleToId */
  private normalizeLeaguepediaRole(input?: string | null): string | null {
    if (!input) return null;
    const r = input.trim().toLowerCase();
    if (['bot','bottom','ad carry','adc','marksman'].includes(r)) return 'adc';
    if (r === 'top' || r === 'jungle' || r === 'mid' || r === 'support') return r;
    return null;
  }

  // ===========
  //  INGESTA EQUIPOS + JUGADORES
  // ===========
  async upsertTeamsAndPlayers(): Promise<void> {
    const leagues = await this.getLeagues();

    let teamCount = 0;
    let playerCount = 0;

    for (const league of leagues) {
      const teamsApi = await this.getTeamsForLeagueSmart(league);

      // === (A) Normalizar entrada (NO dependemos de slug) ===
      type TeamNorm = {
        id: string;
        name: string;
        acronym: string | null;
        image: string | null;
        homeRegion: string | null;
        leagueId: string;        // FK text a esports_league.id (tu esquema)
        slug: string | null;     // null si placeholder o si colisiona
        players: any[];          // tal como venga del feed
      };

      const teamsNorm: TeamNorm[] = teamsApi
        .filter((t: any) => t?.id)
        .map((t: any) => ({
          id: String(t.id).trim(),
          name: this.toStr(t.name ?? t.teamName) ?? 'TBD',
          acronym: this.toStr(t.acronym),
          image: this.toStr(t.image ?? t.logoUrl),
          homeRegion: this.toStr(t.homeRegion ?? t.location),
          leagueId: String(league.id).trim(),
          slug: this.sanitizeSlug(t.slug),
          players: Array.isArray(t.players) ? t.players : [],
        }));

      if (teamsNorm.length === 0) {
        this.logger.warn(`Liga ${league.slug || league.id}: 0 equipos con id válido.`);
        continue;
      }

      // === (B) Dedup por esports_team_id dentro del lote (evita SQLSTATE 21000) ===
      const teamsById = new Map<string, TeamNorm>();
      const dupIds: string[] = [];

      for (const t of teamsNorm) {
        const prev = teamsById.get(t.id);
        if (!prev) {
          teamsById.set(t.id, t);
        } else {
          dupIds.push(t.id);
          // Merge de players por player.id
          if (Array.isArray(t.players) && t.players.length) {
            const seen = new Set(prev.players?.map((p: any) => String(p.id)));
            for (const p of t.players) {
              const pid = p?.id ? String(p.id) : '';
              if (pid && !seen.has(pid)) {
                prev.players.push(p);
                seen.add(pid);
              }
            }
          }
          // Si quieres consolidar otros campos (image/slug/...), puedes añadir lógica aquí
        }
      }

      const teamsUnique = Array.from(teamsById.values());
      if (dupIds.length) {
        this.logger.warn(`[RiotEsportsService] Duplicados por esports_team_id en el lote: ${dupIds.length} → deduplicado`);
      }
      this.logger.log(`[RiotEsportsService] Equipos únicos en lote: ${teamsUnique.length} (antes=${teamsNorm.length})`);

      // === (C) Cargar slugs existentes (para anular colisiones) ===
      const lowerSlugs = Array.from(
        new Set(teamsUnique.map(t => t.slug?.toLowerCase()).filter(Boolean) as string[])
      );

      const slugOwnerBD = new Map<string, string>(); // slug_ci -> esports_team_id
      if (lowerSlugs.length > 0) {
        const existingSlugRows = await this.equipoRepo
          .createQueryBuilder('e')
          .select(['e.esports_team_id AS "esports_team_id"', 'LOWER(e.slug) AS "slug_lower"'])
          .where('LOWER(e.slug) IN (:...slugs)', { slugs: lowerSlugs })
          .getRawMany<{ esports_team_id: string; slug_lower: string }>();
        for (const row of existingSlugRows) {
          if (row.slug_lower) slugOwnerBD.set(row.slug_lower, String(row.esports_team_id));
        }
      }

      // Colisiones: BD y dentro del lote → slug = null
      const batchSlugOwner = new Map<string, string>(); // slug_ci -> id
      for (const t of teamsUnique) {
        if (!t.slug) continue;
        const key = t.slug.toLowerCase();

        const ownerDb = slugOwnerBD.get(key);
        if (ownerDb && ownerDb !== t.id) {
          this.logger.warn(`Slug duplicado con BD "${t.slug}" (BD=${ownerDb}, API=${t.id}) → slug=null`);
          t.slug = null;
          continue;
        }

        const ownerBatch = batchSlugOwner.get(key);
        if (!ownerDb && ownerBatch && ownerBatch !== t.id) {
          this.logger.warn(`Slug duplicado en lote "${t.slug}" (lote=${ownerBatch}, API=${t.id}) → slug=null`);
          t.slug = null;
        } else if (!ownerDb && !ownerBatch) {
          batchSlugOwner.set(key, t.id);
        }
      }

      // === (D) Preparar filas para upsert (sin depender de slug) ===
      const regionCache = new Map<string, number>();
      let teamRows: QueryDeepPartialEntity<Equipo>[] = [];

      for (const t of teamsUnique) {
        const regionKey = `${t.homeRegion}|${league.region}`;
        let regionId = regionCache.get(regionKey);
        if (regionId === undefined) {
          regionId = await this.resolveRegionId(t.homeRegion ?? undefined, league.region);
          regionCache.set(regionKey, regionId);
        }

        teamRows.push({
          esports_team_id: t.id,
          team_name: t.name,
          acronym: t.acronym ?? undefined,
          logo_url: t.image ?? undefined,
          slug: t.slug ?? null,           // ← anulado si colisiona
          league_id: t.leagueId,
          location: t.homeRegion ?? undefined,
          Region_id: regionId,
        });
      }

      // === (D2) Doble barrera de dedupe por si acaso (por si se coló algo en teamRows) ===
      const rowsById = new Map<string, QueryDeepPartialEntity<Equipo>>();
      for (const r of teamRows) {
        const key = String((r as any).esports_team_id);
        if (!rowsById.has(key)) rowsById.set(key, r);
      }
      teamRows = Array.from(rowsById.values());

      // === (E) Upsert equipos por esports_team_id ===
      await this.equipoRepo
        .createQueryBuilder()
        .insert()
        .values(teamRows)
        .orUpdate(
          ['team_name','acronym','logo_url','slug','league_id','location','Region_id'],
          ['esports_team_id'],
          { skipUpdateIfNoValuesChanged: true },
        )
        .execute();

      // === (F) Mapear esports_team_id -> id (FK) ===
      const esportsIds = teamsUnique.map(t => t.id);
      const persistedTeams = await this.equipoRepo.find({
        where: { esports_team_id: In(esportsIds) },
        select: ['id', 'esports_team_id', 'Region_id'],
      });

      const byEsportsId = new Map<string, { id: number; Region_id: number }>();
      for (const e of persistedTeams) {
        byEsportsId.set(String(e.esports_team_id), { id: e.id, Region_id: e.Region_id });
      }
      this.logger.log(`[RiotEsportsService] Team map resuelto: ${byEsportsId.size}/${esportsIds.length}`);

      // === (G) Diagnóstico de players dentro del payload ===
      const withPlayers = teamsUnique.filter(t => Array.isArray(t.players) && t.players.length > 0);
      this.logger.log(`[RiotEsportsService] Equipos con players en payload: ${withPlayers.length}/${teamsUnique.length}`);

      
      
      // (H) Preparar jugadores con FK resuelta
      const playersBatch: QueryDeepPartialEntity<Jugador>[] = [];

      let hadSummonerName = 0, hadFirst = 0, hadLast = 0;

      for (const t of teamsUnique) {
        const persisted = byEsportsId.get(t.id);
        if (!persisted) {
          this.logger.warn(`Equipo no encontrado tras upsert (id_api=${t.id}). Se omiten jugadores.`);
          continue;
        }

        for (const p of t.players ?? []) {
          if (!p?.id) continue;

          const mainRoleId = await this.mapRoleToId(p.role);

          // Nuevos campos desde getTeams
          const summonerName = this.toStr(p.summonerName);
          const firstName    = this.toStr(p.firstName);
          const lastName     = this.toStr(p.lastName);

          if (summonerName) hadSummonerName++;
          if (firstName)    hadFirst++;
          if (lastName)     hadLast++;

          playersBatch.push({
            esports_player_id: String(p.id),

            // ⬇️ Si tu entidad es string | null:
            summoner_name: summonerName ?? null,
            first_name:    firstName    ?? null,
            last_name:     lastName     ?? null,

            // ⬇️ Si prefieres no cambiar entidad (string | undefined), usa:
            // summoner_name: summonerName ?? undefined,
            // first_name:    firstName    ?? undefined,
            // last_name:     lastName     ?? undefined,

            photo_url: this.toStr(p.image ?? p.photoUrl) ?? undefined,
            role_esports: this.toStr(p.role) ?? undefined,
            team_id: persisted.id,
            Region_id: persisted.Region_id ?? this.DEFAULT_REGION_ID,
            Main_role_id: mainRoleId,
            active: p.active ?? true,
          });
        }
      }
      
      
      // Upsert de jugadores por esports_player_id
      if (playersBatch.length > 0) {
        // dedupe defensivo
        const playersById = new Map<string, QueryDeepPartialEntity<Jugador>>();
        for (const r of playersBatch) {
          const k = String((r as any).esports_player_id);
          if (!playersById.has(k)) playersById.set(k, r);
        }
        const playersUnique = Array.from(playersById.values());

        await this.jugadorRepo
          .createQueryBuilder()
          .insert()
          .values(playersUnique)
          .orUpdate(
            [
              'team_id',
              'Region_id',
              'Main_role_id',
              'summoner_name',   // ⬅️ nuevos
              'first_name',
              'last_name',
              'photo_url',
              'role_esports',
              'active',
            ],
            ['esports_player_id'],
            { skipUpdateIfNoValuesChanged: true }
          )
          .execute();

        playerCount += playersUnique.length;

        this.logger.log(
          `[RiotEsportsService] Players: summonerName=${hadSummonerName}, first=${hadFirst}, last=${hadLast} (sobre ${playersBatch.length} en lote)`
        );
      }

      teamCount += teamRows.length;
    }

    this.logger.log(`[RiotEsportsService] Actualizados ${teamCount} equipos y ${playerCount} jugadores`);
  }

  /**
   * Híbrido: REL (ligas+calendario+equipos) + Leaguepedia (roster vigente IsCurrent="1")
   * - Detecta equipos "en competición" por liga y ventana temporal en REL.
   * - Upsert equipos (por esports_team_id) si hay alguno nuevo.
   * - Obtiene roster actual de Leaguepedia por nombre de equipo (REL).
   * - Upsert jugadores (marca is_current, is_substitute, role_id).
   */
  async upsertCurrentRostersHybrid(opts?: {
    leagues?: string[];            // slugs de liga (por defecto LCK/LPL/LEC/LCS)
    pastDays?: number;             // 70 por defecto
    futureDays?: number;           // 28 por defecto
    deactivateNonListed?: boolean; // si true, marca is_current=false a los no devueltos por Leaguepedia
  }): Promise<void> {
    const leagues = await this.getLeagues();
    const wanted = new Set(
      (opts?.leagues?.length ? opts.leagues : this.LEAGUE_WHITELIST).map((s) => s.toLowerCase()),
    );
    const window = {
      pastDays: opts?.pastDays ?? this.DEFAULT_WINDOW.pastDays,
      futureDays: opts?.futureDays ?? this.DEFAULT_WINDOW.futureDays,
    };

    // 1) Slugs de equipos activos por liga (REL Schedule)
    const activeTeamSlugs = new Set<string>();
    for (const lg of leagues) {
      if (!lg?.slug || !wanted.has(lg.slug.toLowerCase())) continue;
      const slugs = await this.getActiveTeamSlugsFromSchedule(lg.id, window);
      slugs.forEach((s) => activeTeamSlugs.add(s));
    }
    if (activeTeamSlugs.size === 0) {
      this.logger.warn('No hay equipos activos en la ventana seleccionada.');
      return;
    }

    // 2) Traer equipos REL por slug
    const teamSlugs = [...activeTeamSlugs];
    const relTeams = await this.fetchTeamsBySlugs(teamSlugs);

    // 3) Upsert de equipos (por si aparece alguno nuevo en este split)
    const leagueById = new Map<string, any>(leagues.map((l: any) => [String(l.id), l]));
    const teamRows: any[] = [];
    const regionCache = new Map<string, number>();

    for (const t of relTeams) {
      const leagueMeta = t?.homeLeague || t?.league || t?.leagues?.[0] || {};
      const leagueId = String(leagueMeta?.id ?? '') || null;
      const leagueObj = leagueId ? leagueById.get(leagueId) : null;

      const teamId = String(t?.id ?? '').trim();
      if (!teamId) continue;

      const name = this.toStr(t?.name ?? t?.teamName) ?? 'TBD';
      const acronym = this.toStr(t?.acronym) ?? undefined;
      const image = this.toStr(t?.image ?? t?.logoUrl) ?? undefined;
      const homeRegion = this.toStr(t?.homeRegion ?? t?.location);
      const slug = this.sanitizeSlug(t?.slug);
      const league_id_text = leagueId || (leagueObj ? String(leagueObj.id) : '');

      const regionKey = `${homeRegion}|${leagueObj?.region ?? ''}`;
      let regionId = regionCache.get(regionKey);
      if (regionId === undefined) {
        regionId = await this.resolveRegionId(homeRegion ?? undefined, leagueObj?.region);
        regionCache.set(regionKey, regionId);
      }

      teamRows.push({
        esports_team_id: teamId,
        team_name: name,
        acronym,
        logo_url: image,
        slug: slug ?? null,
        league_id: league_id_text,
        location: homeRegion ?? undefined,
        Region_id: regionId,
      });
    }

    // Dedupe por esports_team_id y upsert
    if (teamRows.length > 0) {
      const rowsById = new Map<string, any>();
      for (const r of teamRows) {
        const key = String(r.esports_team_id);
        if (!rowsById.has(key)) rowsById.set(key, r);
      }
      const uniqueRows = [...rowsById.values()];

      await this.equipoRepo
        .createQueryBuilder()
        .insert()
        .values(uniqueRows)
        .orUpdate(
          ['team_name', 'acronym', 'logo_url', 'slug', 'league_id', 'location', 'Region_id'],
          ['esports_team_id'],
          { skipUpdateIfNoValuesChanged: true },
        )
        .execute();
    }

    // 4) Mapear esports_team_id -> PK interno para FK en jugador
    const esportsIds = relTeams.map((t: any) => String(t?.id)).filter(Boolean);
    const persistedTeams = await this.equipoRepo.find({
      where: { esports_team_id: In(esportsIds) },
      select: ['id', 'esports_team_id', 'team_name', 'Region_id'],
    });

    const byEsportsId = new Map<string, { id: number; Region_id: number; team_name: string }>();
    for (const e of persistedTeams) {
      byEsportsId.set(String(e.esports_team_id), {
        id: e.id,
        Region_id: e.Region_id,
        team_name: e.team_name,
      });
    }

    // 5) Por cada equipo, pedir roster vigente (Leaguepedia) usando el nombre del equipo (REL)
    for (const t of relTeams) {
      const teamId = String(t?.id ?? '');
      if (!teamId) continue;
      const persisted = byEsportsId.get(teamId);
      if (!persisted) continue;

      const teamName = this.toStr(t?.name ?? t?.teamName);
      if (!teamName) continue;

      const rows = await this.leaguepedia.getCurrentRosterByTeamName(teamName);

      // Conjunto de claves para marcar quién queda “vigente” al cierre
      const currentKeys = new Set<string>(); // summoner_name o leaguepedia_player_id

      for (const r of rows) {
        const lpPlayerId = r.ID?.trim() || null; // Players.ID (wiki)
        const isSub = r.IsSubstitute === '1';
        const roleForMap = this.normalizeLeaguepediaRole(r.Role);
        const roleId = await this.mapRoleToId(roleForMap ?? undefined);

        // Heurística: usar el ID wiki como summoner_name si no hay otra cosa
        const summonerName = lpPlayerId || null;

        // =========================
        // RESOLVER JUGADOR EXISTENTE (global):
        // 1º leaguepedia_player_id (UNIQUE global), 2º summoner_name (global)
        // =========================
        let jugador = null as Jugador | null;

        if (lpPlayerId) {
          jugador = await this.jugadorRepo.findOne({
            where: { leaguepedia_player_id: lpPlayerId },
          });
        }
        if (!jugador && summonerName) {
          jugador = await this.jugadorRepo.findOne({
            where: { summoner_name: summonerName },
          });
        }

        // =========================
        // CREAR O ACTUALIZAR
        // =========================
        if (!jugador) {
          const partial: DeepPartial<Jugador> = {
            team_id: persisted.id,
            Region_id: persisted.Region_id ?? this.DEFAULT_REGION_ID,
            leaguepedia_player_id: lpPlayerId, // puede ser null
            esports_player_id: null,           // no lo tocamos en híbrido
            summoner_name: summonerName,       // puede ser null
            first_name: null,
            last_name: null,
            photo_url: null,
            role_esports: null,
            Main_role_id: roleId ?? this.DEFAULT_ROLE_ID,
            active: true,
            is_current: true,
            is_substitute: isSub,
            eliminated: null,
          };
          jugador = this.jugadorRepo.create(partial);
        } else {
          // Actualiza equipo y flags del roster vigente
          jugador.team_id = persisted.id;
          jugador.Region_id = persisted.Region_id ?? this.DEFAULT_REGION_ID;
          jugador.Main_role_id = roleId ?? jugador.Main_role_id ?? this.DEFAULT_ROLE_ID;
          jugador.is_current = true;
          jugador.is_substitute = isSub;
          jugador.active = true;

          // Consolidar identidad Leaguepedia si faltaba
          if (lpPlayerId && !jugador.leaguepedia_player_id) {
            jugador.leaguepedia_player_id = lpPlayerId;
          }
          // Opcional: si no tiene summoner_name aún, rellénalo
          if (!jugador.summoner_name && summonerName) {
            jugador.summoner_name = summonerName;
          }
        }

        await this.jugadorRepo.save(jugador);

        // Claves para “vigente”
        if (summonerName) currentKeys.add(summonerName.toLowerCase());
        if (lpPlayerId) currentKeys.add(lpPlayerId.toLowerCase());
      }

      // 6) (Opcional) desactivar los no devueltos por Leaguepedia en este equipo
      if (opts?.deactivateNonListed) {
        const allTeamPlayers = await this.jugadorRepo.find({ where: { team_id: persisted.id } });
        for (const p of allTeamPlayers) {
          const keys = [p.summoner_name, p.leaguepedia_player_id]
            .filter(Boolean)
            .map((s) => String(s).toLowerCase());
          const inCurrent = keys.some((k) => currentKeys.has(k));
          if (!inCurrent) {
            p.is_current = false;
            await this.jugadorRepo.save(p);
          }
        }
      }
    }

    this.logger.log(`[RiotEsportsService] Híbrido OK: rosters vigentes actualizados.`);
  }
}