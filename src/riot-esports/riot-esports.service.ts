import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // @InjectRepository(Region)
    // private readonly regionRepo: Repository<Region>,
  ) {}

  private getHeaders() {
    return { 'x-api-key': this.apiKey };
  }

  // ==========
  //  LEAGUES
  // ==========
  async getLeagues(): Promise<any[]> {
    const url = `${this.baseUrl}/getLeagues`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.getHeaders() }),
    );
    return res.data?.data?.leagues || [];
  }

  async upsertLeagues(): Promise<void> {
    const leagues = await this.getLeagues();

    for (const league of leagues) {
      await this.leagueRepo.upsert(
        {
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

  // =========
  //  TEAMS
  // =========
  async getTeams(leagueId: string): Promise<any[]> {
    const url = `${this.baseUrl}/getTeams?hl=en-US&id=${leagueId}`;
    const res = await firstValueFrom(
      this.httpService.get(url, { headers: this.getHeaders() }),
    );
    return res.data?.data?.teams || [];
  }

  // Helpers
  private normalizeRole(role?: string): 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT'|null {
    if (!role) return null;
    const r = role.toUpperCase().trim();
    if (r === 'TOP' || r === 'TOPLANE') return 'TOP';
    if (r === 'JUNGLE' || r === 'JG') return 'JUNGLE';
    if (r === 'MID' || r === 'MIDDLE') return 'MID';
    if (r === 'BOT' || r === 'ADC' || r === 'BOTTOM' || r === 'AD CARRY') return 'ADC';
    if (r === 'SUPPORT' || r === 'SUP') return 'SUPPORT';
    return null;
  }

  private async mapRoleToId(role?: string): Promise<number> {
    const norm = this.normalizeRole(role);
    if (!norm) return this.DEFAULT_ROLE_ID;

    // Intentar encontrar por name o slug (ajusta a tu schema si usas otros campos)
    const rol = await this.rolRepo.findOne({
      where: [{ name: norm }, { slug: norm }],
    } as any); // 'as any' para permitir OR flexible

    if (rol?.id) return Number(rol.id);
    return this.DEFAULT_ROLE_ID;
  }

  private async resolveRegionId(homeRegion?: string, leagueRegion?: string): Promise<number> {
    // TODO (si quieres): buscar en tu tabla Region por name/slug/código
    // Ejemplo (ajusta a tus columnas reales):
    // const guess = (homeRegion ?? leagueRegion ?? '').toUpperCase();
    // const region = await this.regionRepo.findOne({
    //   where: [{ code: guess }, { slug: guess }, { name: ILike(`%${guess}%`) }],
    // } as any);
    // return region?.id ? Number(region.id) : this.DEFAULT_REGION_ID;

    return this.DEFAULT_REGION_ID;
  }

  async upsertTeamsAndPlayers(): Promise<void> {
    const leagues = await this.getLeagues();

    let teamCount = 0;
    let playerCount = 0;

    for (const league of leagues) {
      const teams = await this.getTeams(league.id);

      for (const team of teams ?? []) {
        // Determinar Region_id para equipo
        const regionId = await this.resolveRegionId(team.homeRegion, league.region);

        // 1) UPSERT del equipo (incluye Region_id porque en tu entity es NOT NULL)
        await this.equipoRepo.upsert(
          {
            team_name: team.name,
            acronym: team.acronym ?? null,
            logo_url: team.image ?? null,
            slug: team.slug ?? null,               // existe en tu Entity
            esports_team_id: team.id ?? null,      // existe en tu Entity
            league_id: league.id ?? null,          // existe en tu Entity
            location: team.homeRegion ?? null,
            Region_id: regionId,                   // requerido en tu Entity
          },
          ['esports_team_id'],                      // conflict target
        );

        // 2) Recuperar la entidad real para leer su 'id' y Region_id
        const equipo = await this.equipoRepo.findOne({
          where: { esports_team_id: team.id ?? null },
        });

        if (!equipo) {
          this.logger.warn(`No se pudo recuperar el equipo con esports_team_id=${team.id}`);
          continue;
        }

        teamCount++;

        // 3) UPSERT de jugadores del equipo
        for (const player of team.players ?? []) {
          const mainRoleId = await this.mapRoleToId(player.role);

          await this.jugadorRepo.upsert(
            {
              esports_player_id: player.id ?? null,
              display_name: player.name ?? null,
              role_esports: player.role ?? null,
              photo_url: player.image ?? null,
              country: player.country ?? null,

              // Requeridos por tu Entity Jugador
              team_id: equipo.id,
              Region_id: equipo.Region_id ?? regionId,
              Main_role_id: mainRoleId,

              // Otros campos opcionales (se mantienen null/por defecto)
              active: true,
            },
            ['esports_player_id'],
          );

          playerCount++;
        }
      }
    }

    this.logger.log(`Actualizados ${teamCount} equipos y ${playerCount} jugadores`);
  }
}
