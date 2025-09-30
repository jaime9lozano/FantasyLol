import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeaguepediaClient } from './leaguepedia.client';
import { CargoResponse, LpTeamRow } from './dto/cargo.dto';
import { Team } from '../entities/team.entity';
import { buildLeagueWhere, leagueAliases, looksLikeLeagueIconKey } from './leaguepedia.helpers';

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
  async listTeamsPlayedInLeague(
  leagueNameLike: string,
  from?: string,
  to?: string,
): Promise<string[]> {
  const aliases = leagueAliases(leagueNameLike);

  // 1) Filtros anti-ruido comunes
  const commonFilters: string[] = [
    `T.IsOfficial="1"`,
    `(T.TournamentLevel="Primary" OR T.TournamentLevel IS NULL)`,
    // Excluir subligas / academias habituales
    `T.League NOT LIKE "%Challenger%"`,
    `T.Name   NOT LIKE "%Challenger%"`,
    `T.League NOT LIKE "%Challengers%"`,
    `T.Name   NOT LIKE "%Challengers%"`,
    `T.League NOT LIKE "%Academy%"`,
    `T.Name   NOT LIKE "%Academy%"`,
    `T.League NOT LIKE "%LDL%"`,   // Liga de desarrollo de LPL
    `T.Name   NOT LIKE "%LDL%"`,
    // Puedes añadir más si detectas ruido ("Amateur", "Open", etc.)
    `SP.Team IS NOT NULL`,
  ];
  if (from) commonFilters.push(`SP.DateTime_UTC >= "${from}"`);
  if (to)   commonFilters.push(`SP.DateTime_UTC <= "${to}"`);

  // 2) Intento "pro": LeagueIconKey exacto si parece un key tipo LCK21 / LPL2020
  const tryIconKey = looksLikeLeagueIconKey(leagueNameLike);
  if (tryIconKey) {
    const iconKey = leagueNameLike.trim();
    // PRO TIP: algunas wikis usan T.LeagueIcon en lugar de T.LeagueIconKey.
    // Probamos primero con LeagueIconKey y si la llamada falla o devuelve 0, hacemos fallback.
    const iconWhere = [`T.LeagueIconKey="${iconKey}"`, ...commonFilters].join(' AND ');
    try {
      const rowsIcon = await this.lp.cargoQueryAll<{ Team: string }>({
        tables: 'ScoreboardPlayers=SP,Tournaments=T',
        joinOn: 'SP.OverviewPage=T.OverviewPage',
        fields: 'SP.Team',
        where: iconWhere,
        groupBy: 'SP.Team',
        orderBy: 'SP.Team ASC',
        limit: 500,
      });

      if (rowsIcon?.length) {
        // Opcional: ordenar por si el API no respeta del todo el order_by con group
        return rowsIcon.map(r => r.Team).filter(Boolean);
      }
    } catch {
      // Si el campo T.LeagueIconKey no existe en esta instancia de Cargo, caemos a alias.
    }
  }

  // 3) Fallback: OR de alias (siglas + nombre largo + literal del user)
  const conds = aliases.map(a => buildLeagueWhere(a));
  const orFamily = `(${conds.join(' OR ')})`;
  const finalWhere = [orFamily, ...commonFilters].join(' AND ');

  const rows = await this.lp.cargoQueryAll<{ Team: string }>({
    tables: 'ScoreboardPlayers=SP,Tournaments=T',
    joinOn: 'SP.OverviewPage=T.OverviewPage',
    fields: 'SP.Team',
    where: finalWhere,
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
  private async upsertTeamFromRow(row: LpTeamRow, imageMap: Record<string, string>, leagueId: number | null) {
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
        leagueId: existing.leagueId ?? leagueId,
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
        leagueId,
      });
      return insert.identifiers?.[0]?.id as number;
    }
  }

  /**
   * Descubre equipos que jugaron en una liga y los inserta/actualiza con catálogo + logos.
   */
  async upsertTeamsByLeagueNameLike(leagueCodeOrLike: string, from?: string, to?: string) {
  const names = await this.listTeamsPlayedInLeague(leagueCodeOrLike, from, to);
  if (!names.length) return { discovered: 0, enriched: 0, upserts: 0 };

  // Resuelve league_id por code (si existe)
  const leagueCode = leagueCodeOrLike.toUpperCase();
  const leagueRow = await this.teamRepo.manager.query(
    'SELECT id FROM league WHERE LOWER(code)=LOWER($1) LIMIT 1', [leagueCode]
  );
  const leagueId: number | null = leagueRow?.[0]?.id ?? null;

  const enriched: LpTeamRow[] = [];
  for (const n of names) {
    const row = await this.fetchTeamCatalogByName(n).catch(() => null);
    if (row) enriched.push(row);
    await new Promise(r => setTimeout(r, 100));
  }

  const logoFiles = enriched.map(e => e.LogoFile).filter(Boolean) as string[];
  const imageMap = await this.lp.resolveImageUrls(logoFiles);

  let upserts = 0;
  for (const row of enriched) {
    const id = await this.upsertTeamFromRow(row, imageMap, leagueId); // 👈 pasa leagueId
    upserts++;
  }
  return { discovered: names.length, enriched: enriched.length, upserts };
}
}
