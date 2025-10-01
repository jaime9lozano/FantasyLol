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

  // Helper para poner bien league_id
  private async resolveLeagueId(
    leagueCodeOrLike: string,
    from?: string,
    to?: string,
  ): Promise<number | null> {
    const mgr = this.teamRepo.manager;
    const raw = leagueCodeOrLike.trim();
    // Base: letras (LPL, LCK, etc.)
    const baseCode = raw.replace(/[0-9]/g, '').toUpperCase();

    // 0) Intento exacto por code (por si ya nos pasan 'LPL2020' o 'LPL')
    let row = await mgr.query(
      'SELECT id, code FROM league WHERE LOWER(code)=LOWER($1) LIMIT 1',
      [raw],
    );
    if (row?.[0]?.id) return row[0].id;

    // 1) Si from/to son del mismo año, probamos base + año (p. ej. 'LPL2025')
    let year: number | undefined;
    if (from && to) {
      // asume 'YYYY-MM-DD HH:mm:SS' en UTC
      const yf = new Date(from.replace(' ', 'T') + 'Z');
      const yt = new Date(to.replace(' ', 'T') + 'Z');
      if (!isNaN(yf.getTime()) && !isNaN(yt.getTime()) && yf.getUTCFullYear() === yt.getUTCFullYear()) {
        year = yf.getUTCFullYear();
      }
    }
    if (year) {
      row = await mgr.query(
        'SELECT id, code FROM league WHERE LOWER(code)=LOWER($1) LIMIT 1',
        [`${baseCode}${year}`],
      );
      if (row?.[0]?.id) return row[0].id;
    }

    // 2) Última oficial más "reciente" cuyo code empiece por base (LPL%)
    //   Ordena por la parte numérica descendente (NULLS LAST para códigos sin números)
    row = await mgr.query(
      `
      SELECT id, code
      FROM league
      WHERE is_official = TRUE
        AND code ILIKE $1
      ORDER BY NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int DESC NULLS LAST
      LIMIT 1
      `,
      [`${baseCode}%`],
    );
    if (row?.[0]?.id) return row[0].id;

    // 3) Por nombre o code aproximado (cubre casos como "Tencent LoL Pro League")
    row = await mgr.query(
      `
      SELECT id, code
      FROM league
      WHERE is_official = TRUE
        AND (name ILIKE $1 OR code ILIKE $2)
      LIMIT 1
      `,
      [`%${baseCode}%`, `%${baseCode}%`],
    );
    if (row?.[0]?.id) return row[0].id;

    return null;
  }

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
  private escapeCargo(s: string): string {
    return s.replace(/"/g, '\\"');
  }

  async fetchTeamCatalogByName(teamName: string): Promise<LpTeamRow | null> {
    const q = (where: string) =>
      this.lp.cargoQuery<CargoResponse<LpTeamRow>>({
        tables: 'Teams',
        fields:
          'Teams.OverviewPage=TeamPage,Teams.Name=TeamName,Teams.Short=Short,Teams.Region=Region,Teams.Location=Location,Teams.Image=LogoFile',
        where,
        limit: 1,
      });

    const name = teamName.trim();
    const esc = (s: string) => `"${this.escapeCargo(s)}"`;

    // 1) Name exacto
    let res = await q(`Teams.Name=${esc(name)}`);
    if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;

    // 2) OverviewPage exacta (p. ej. "Ninjas in Pyjamas.CN")
    res = await q(`Teams.OverviewPage=${esc(name)}`);
    if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;

    // 3) OverviewPage con underscores (por si el nombre venía con espacios)
    const pageUnderscore = name.replace(/ /g, '_');
    if (pageUnderscore !== name) {
      res = await q(`Teams.OverviewPage=${esc(pageUnderscore)}`);
      if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;
    }

    // 4) Si viene con sufijo ".XX" (".CN", ".BR", etc.), probamos el base
    const m = name.match(/^(.*)\.[A-Za-z]{2,3}$/);
    if (m) {
      const base = m[1].trim();

      // 4a) Name base exacto
      res = await q(`Teams.Name=${esc(base)}`);
      if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;

      // 4b) OverviewPage que empiece por el base (captura "Ninjas in Pyjamas.CN")
      res = await q(`Teams.OverviewPage LIKE ${esc(`${base}%`)}`);
      if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;
    }

    // 5) Último recurso: Short exacto (si SP.Team fuera el tag)
    res = await q(`Teams.Short=${esc(name)}`);
    if (res?.cargoquery?.[0]?.title) return res.cargoquery[0].title;

    return null;
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
  const leagueId = await this.resolveLeagueId(leagueCodeOrLike, from, to);

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
