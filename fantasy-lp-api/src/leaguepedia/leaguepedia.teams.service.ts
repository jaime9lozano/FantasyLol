import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeaguepediaClient } from './leaguepedia.client';
import { CargoResponse, LpTeamRow } from './dto/cargo.dto';
import { Team } from '../entities/team.entity';

@Injectable()
export class LeaguepediaTeamsService {
  private readonly logger = new Logger(LeaguepediaTeamsService.name);

  constructor(
    private readonly lp: LeaguepediaClient,
    @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
  ) {}

  /**
   * Devuelve la lista DISTINCT de Team (nombres) que han jugado en una liga
   * filtrando por nombre de torneo (T.Name LIKE "%...%") y rango (opcional).
   */
  async listTeamsPlayedInLeague(leagueNameLike: string, from?: string, to?: string): Promise<string[]> {
    const where: string[] = [`T.Name LIKE "%${leagueNameLike}%"`];
    if (from) where.push(`SP.DateTime_UTC >= "${from}"`);
    if (to) where.push(`SP.DateTime_UTC <= "${to}"`);

    const rows = await this.lp.cargoQueryAll<{ Team: string }>({
      tables: 'ScoreboardPlayers=SP,Tournaments=T',
      joinOn: 'SP.OverviewPage=T.OverviewPage',
      fields: 'SP.Team',
      where: where.join(' AND '),
      groupBy: 'SP.Team',
      orderBy: 'SP.Team ASC',
      limit: 500,
    });

    return rows.map(r => r.Team).filter(Boolean);
  }

  /**
   * Enriquecimiento del equipo por catálogo (tabla Teams).
   */
  async fetchTeamCatalogByName(teamName: string): Promise<LpTeamRow | null> {
    const res = await this.lp.cargoQuery<CargoResponse<LpTeamRow>>({
      tables: 'Teams',
      fields: 'Teams.OverviewPage=TeamPage,Teams.Name=TeamName,Teams.Short=Short,Teams.Region=Region,Teams.Location=Location,Teams.Image=LogoFile',
      where: `Teams.Name="${teamName}"`,
      limit: 1,
    });
    return res?.cargoquery?.[0]?.title ?? null;
  }

  /**
   * Upsert en tabla team, buscando por LOWER(leaguepedia_team_page) si existe,
   * o por LOWER(team_name) como fallback.
   */
  private async upsertTeamFromRow(row: LpTeamRow, imageMap: Record<string, string>) {
    const lpPage = row.TeamPage ?? null;
    const logoKey = row.LogoFile ? (row.LogoFile.startsWith('File:') ? row.LogoFile : `File:${row.LogoFile}`) : undefined;
    const logoUrl = logoKey ? imageMap[logoKey] ?? null : null;

    const existing = lpPage
      ? await this.teamRepo.createQueryBuilder('t')
          .where('LOWER(t.leaguepedia_team_page) = LOWER(:p)', { p: lpPage })
          .getOne()
      : await this.teamRepo.createQueryBuilder('t')
          .where('LOWER(t.team_name) = LOWER(:n)', { n: row.TeamName })
          .getOne();

    if (existing) {
      await this.teamRepo.update({ id: existing.id }, {
        leaguepediaTeamPage: lpPage,
        teamName: row.TeamName,
        short: row.Short ?? null,
        region: row.Region ?? null,
        location: row.Location ?? null,
        logoFile: row.LogoFile ?? null,
        logoUrl,
      });
      return existing.id;
    } else {
      const insert = await this.teamRepo.insert({
        leaguepediaTeamPage: lpPage,
        teamName: row.TeamName,
        short: row.Short ?? null,
        region: row.Region ?? null,
        location: row.Location ?? null,
        logoFile: row.LogoFile ?? null,
        logoUrl,
      });
      return insert.identifiers?.[0]?.id as number;
    }
  }

  /**
   * Descubre equipos que jugaron en una liga y los inserta/actualiza con catálogo + logos.
   */
  
async upsertTeamsByLeagueNameLike(leagueNameLike: string, from?: string, to?: string) {
    const names = await this.listTeamsPlayedInLeague(leagueNameLike, from, to);
    if (!names.length) return { discovered: 0, enriched: 0, upserts: 0 };

    const enriched: LpTeamRow[] = [];
    for (const n of names) {
      try {
        const row = await this.fetchTeamCatalogByName(n);
        if (row) enriched.push(row);
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        this.logger.warn(`No se pudo enriquecer "${n}": ${(e as Error).message}`);
      }
    }

    const logoFiles = enriched.map(e => e.LogoFile).filter(Boolean) as string[];
    const imageMap = await this.lp.resolveImageUrls(logoFiles);

    let upserts = 0;
    for (const row of enriched) {
      const lpPage = row.TeamPage ?? null;
      const logoKey = row.LogoFile ? (row.LogoFile.startsWith('File:') ? row.LogoFile : `File:${row.LogoFile}`) : undefined;
      const logoUrl = logoKey ? imageMap[logoKey] ?? null : null;

      const existing = lpPage
        ? await this.teamRepo.createQueryBuilder('t')
            .where('LOWER(t.leaguepedia_team_page) = LOWER(:p)', { p: lpPage })
            .getOne()
        : await this.teamRepo.createQueryBuilder('t')
            .where('LOWER(t.team_name) = LOWER(:n)', { n: row.TeamName })
            .getOne();

      if (existing) {
        await this.teamRepo.update({ id: existing.id }, {
          leaguepediaTeamPage: lpPage,
          teamName: row.TeamName,
          short: row.Short ?? null,
          region: row.Region ?? null,
          location: row.Location ?? null,
          logoFile: row.LogoFile ?? null,
          logoUrl,
        });
      } else {
        await this.teamRepo.insert({
          leaguepediaTeamPage: lpPage,
          teamName: row.TeamName,
          short: row.Short ?? null,
          region: row.Region ?? null,
          location: row.Location ?? null,
          logoFile: row.LogoFile ?? null,
          logoUrl,
        });
      }
      upserts++;
    }

    return { discovered: names.length, enriched: enriched.length, upserts };
  }
}
