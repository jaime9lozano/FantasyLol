import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { EsportsLeague } from 'src/esports_league/entities/esports_league.entity';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Jugador } from 'src/jugador/entities/jugador.entity';
import { Rol } from 'src/rol/entities/rol.entity';
// import { Region } from 'src/region/entities/region.entity';


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
  ) {}

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

  /** ¿Es un slug placeholder genérico? */
private isPlaceholderSlug(slug?: string): boolean {
  if (!slug) return true;
  const s = slug.trim().toLowerCase();
  return (
    s === 'tbd' ||
    s === 'tba' ||
    s === 'unknown' ||
    s === 'team' ||
    s === 'placeholder' ||
    /^tbd-?\d*$/.test(s)
  );
}


/** Slug “seguro”: si es placeholder o vacío, devolvemos null (luego lo convertimos a undefined al upsert) */
private deriveSafeSlug(team: any, league?: { id: string; slug?: string }): string | null {
  const raw = (team.slug ?? '').toString().trim();
  if (!raw || this.isPlaceholderSlug(raw)) return null;
  return raw;
}

/** Convierte null|undefined → undefined (útil para cumplir tipos TS de la entidad) */
private toUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
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
  //  HELPERS
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

/** Busca en tu tabla Rol por la columna `rol` (case-insensitive). */
private async mapRoleToId(role?: string): Promise<number> {
  const norm = this.normalizeRole(role);
  if (!norm) return this.DEFAULT_ROLE_ID;

  const found = await this.rolRepo.findOne({
    where: { rol: ILike(norm) }, // 'Top'=='top' case-insensitive
  });

  if (found?.id) return Number(found.id);

  this.logger.warn(
    `Rol "${norm}" no encontrado en tabla Rol (columna 'rol'). Usando DEFAULT_ROLE_ID=${this.DEFAULT_ROLE_ID}`,
  );
  return this.DEFAULT_ROLE_ID;
}

  private async resolveRegionId(homeRegion?: string, leagueRegion?: string): Promise<number> {
    // TODO: si quieres, mapear a tu tabla Region (code/slug/name). Por ahora: default.
    return this.DEFAULT_REGION_ID;
  }

  // ===========
  //  INGESTA EQUIPOS + JUGADORES
  // ===========
 async upsertTeamsAndPlayers(): Promise<void> {
  const leagues = await this.getLeagues();

  let teamCount = 0;
  let playerCount = 0;

  for (const league of leagues) {
    const teams = await this.getTeamsForLeagueSmart(league);

    for (const team of teams ?? []) {
      // Si la API no trae ID de equipo, no podemos upsertear de forma idempotente
      if (!team?.id) {
        this.logger.warn(`Equipo sin id en liga=${league.slug || league.id}, name=${team?.name}`);
        continue;
      }

      // Region_id para equipo
      const regionId = await this.resolveRegionId(team.homeRegion, league.region);

      // Slug seguro (null si es placeholder); OJO: pasaremos undefined al upsert, no null.
      const safeSlug = this.deriveSafeSlug(team, league);

      // Construimos el payload usando undefined (NO null) para contentar al tipo TS de la entidad
      const teamEntity = {
        team_name: this.toUndef(team.name) ?? 'TBD',
        acronym: this.toUndef(team.acronym),                          // si tu entidad no acepta null en TS
        logo_url: this.toUndef(team.image ?? team.logoUrl),
        slug: this.toUndef(safeSlug),                                 // null -> undefined
        esports_team_id: this.toUndef(team.id),                       // este debería existir
        league_id: this.toUndef(league.id),                           // ⚠️ ajusta si tu FK espera PK interno
        location: this.toUndef(team.homeRegion),
        Region_id: regionId,                                          // número => OK
      } as const;

      try {
        await this.equipoRepo.upsert(teamEntity as any, ['esports_team_id']);
      } catch (e: any) {
        // Si la colisión es por el índice único del slug, registramos y reintentamos SIN el slug
        if (e?.code === '23505' && e?.constraint === 'equipo_slug_uidx') {
          this.logger.warn(
            `Slug duplicado "${teamEntity.slug}" para "${team.name}" (league=${league.slug || league.id}). Reintentando sin slug...`,
          );
          const retryEntity = { ...teamEntity, slug: undefined };
          await this.equipoRepo.upsert(retryEntity as any, ['esports_team_id']);
        } else {
          // Otros errores: los registramos y seguimos con el siguiente equipo (no paramos toda la ingesta)
          this.logger.error(
            `Error upsert equipo "${team.name}" (league=${league.slug || league.id}): ${e?.message || e}`,
          );
          continue;
        }
      }

      // Recuperar el equipo por esports_team_id (para FK en jugador)
      const equipo = await this.equipoRepo.findOne({
        where: { esports_team_id: team.id },
      });
      if (!equipo) {
        this.logger.warn(
          `No se pudo recuperar equipo esports_team_id=${team.id} (league=${league.slug || league.id})`,
        );
        continue;
      }

      teamCount++;

      // Jugadores
      for (const player of team.players ?? []) {
        // Si la API no trae id de jugador, saltamos (mantiene idempotencia)
        if (!player?.id) {
          this.logger.warn(`Jugador sin id en team=${team.slug || team.name}`);
          continue;
        }

        const mainRoleId = await this.mapRoleToId(player.role);

        try {
          await this.jugadorRepo.upsert(
            {
              esports_player_id: player.id,
              display_name: this.toUndef(player.name),
              role_esports: this.toUndef(player.role),
              photo_url: this.toUndef(player.image ?? player.photoUrl),
              country: this.toUndef(player.country),

              team_id: equipo.id,                        // FK interno correcto
              Region_id: equipo.Region_id ?? regionId,
              Main_role_id: mainRoleId,

              active: true,
            } as any,
            ['esports_player_id'],
          );
          playerCount++;
        } catch (e: any) {
          // Si un jugador falla, log y seguimos con los demás
          this.logger.warn(
            `No se pudo upsert jugador "${player?.name ?? player?.id}" del equipo "${team.name}": ${e?.message || e}`,
          );
          continue;
        }
      }
    }
  }

  this.logger.log(`Actualizados ${teamCount} equipos y ${playerCount} jugadores`);
}
}

