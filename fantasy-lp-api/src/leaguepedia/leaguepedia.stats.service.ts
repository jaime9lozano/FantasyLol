import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LeaguepediaClient } from './leaguepedia.client';
import { CargoResponse, LpGameRow, LpPlayerGameStatRow, LpTournamentRow } from './dto/cargo.dto';
import { buildLeagueWhere, leagueAliases, looksLikeLeagueIconKey, normalizeRole, toBoolYN, toInt, toUtcDate } from './leaguepedia.helpers';
import { Tournament } from '../entities/tournament.entity';
import { Game } from '../entities/game.entity';
import { Player } from '../entities/player.entity';
import { PlayerGameStats } from '../entities/player-game-stats.entity';
import { TeamPlayerMembership } from '../entities/team-player-membership.entity';
import { Role } from '../entities/role.entity';
import { Team } from '../entities/team.entity';

@Injectable()
export class LeaguepediaStatsService {
  private readonly logger = new Logger(LeaguepediaStatsService.name);

  constructor(
    private readonly lp: LeaguepediaClient,
    @InjectRepository(Tournament) private readonly tournamentRepo: Repository<Tournament>,
    @InjectRepository(Game) private readonly gameRepo: Repository<Game>,
    @InjectRepository(Player) private readonly playerRepo: Repository<Player>,
    @InjectRepository(PlayerGameStats) private readonly statsRepo: Repository<PlayerGameStats>,
    @InjectRepository(TeamPlayerMembership) private readonly tpmRepo: Repository<TeamPlayerMembership>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
  ) {}

  // ------------------ Tournaments ------------------
  async fetchTournamentsByNameLike(nameLike: string, year?: number, officialOnly?: boolean, primaryOnly?: boolean): Promise<LpTournamentRow[]> {
    const where: string[] = [`Tournaments.Name LIKE "%${nameLike}%"`];
    if (year) where.push(`Tournaments.Year="${year}"`);
    if (officialOnly != null) where.push(`Tournaments.IsOfficial="${officialOnly ? '1' : '0'}"`);
    if (primaryOnly === true) {
      where.push(`Tournaments.TournamentLevel="Primary"`);
    } else if (primaryOnly === false) {
      // Opcional: si pones primary=0 y quieres EXCLUIR los Primary
      where.push(`(Tournaments.TournamentLevel IS NULL OR Tournaments.TournamentLevel <> "Primary")`);
    }


    const rows = await this.lp.cargoQueryAll<LpTournamentRow>({
      tables: 'Tournaments',
      fields:
        'Tournaments.Name=Name,Tournaments.OverviewPage=OverviewPage,Tournaments.League=League,Tournaments.Region=Region,Tournaments.Year=Year,Tournaments.IsOfficial=IsOfficial, Tournaments.DateStart=DateStart,Tournaments.Date=Date,Tournaments.Split=Split,Tournaments.TournamentLevel=TournamentLevel,Tournaments.LeagueIconKey=LeagueIconKey',
      where: where.join(' AND '),
      orderBy: 'Tournaments.DateStart ASC',
      limit: 500,
    });
    return rows;
  }

  async upsertTournaments(rows: LpTournamentRow[]) {
    let count = 0;
    for (const t of rows) {
      const existing = await this.tournamentRepo
        .createQueryBuilder('x')
        .where('LOWER(x.overview_page) = LOWER(:p)', { p: t.OverviewPage })
        .getOne();

      const isOfficial = t.IsOfficial ? t.IsOfficial === '1' : null;
      const year = typeof t.Year === 'string' ? parseInt(t.Year, 10) : t.Year ?? null;

      if (existing) {
        await this.tournamentRepo.update({ id: existing.id }, {
          name: t.Name ?? null,
          league: t.League ?? null,
          region: t.Region ?? null,
          year,
          isOfficial,
          dateStart: t.DateStart ?? null,
          dateEnd: t.Date ?? null,
          split: t.Split ?? null,
          tournamentLevel: t.TournamentLevel ?? null,
          leagueIconKey: t.LeagueIconKey ?? null,
        });
      } else {
        await this.tournamentRepo.insert({
          overviewPage: t.OverviewPage,
          name: t.Name ?? null,
          league: t.League ?? null,
          region: t.Region ?? null,
          year,
          isOfficial,
          dateStart: t.DateStart ?? null,
          dateEnd: t.Date ?? null,
          split: t.Split ?? null,
          tournamentLevel: t.TournamentLevel ?? null,
          leagueIconKey: t.LeagueIconKey ?? null,
        });
      }
      count++;
    }
    return count;
  }

  // ------------------ Games ------------------

  async fetchGamesByLeagueNameLike(leagueNameLike: string, from?: string, to?: string): Promise<LpGameRow[]> {
    const common = [
      from ? `SG.DateTime_UTC >= "${from}"` : null,
      to   ? `SG.DateTime_UTC <= "${to}"`   : null,
    ].filter(Boolean).join(' AND ');

    const makeWhere = (cond: string) => common ? `${cond} AND ${common}` : cond;

    // 1) Por nombre del torneo
    let rows = await this.lp.cargoQueryAll<LpGameRow>({
      tables: 'ScoreboardGames=SG,Tournaments=T',
      joinOn: 'SG.OverviewPage=T.OverviewPage',
      fields:
        'SG.GameId=GameId,SG.DateTime_UTC=DateTimeUTC,SG.Team1,SG.Team2,SG.WinTeam,SG.LossTeam,SG.Winner,SG.Patch,SG.OverviewPage=OverviewPage,T.Name=Tournament',
      where: makeWhere(`T.Name LIKE "%${leagueNameLike}%"`),
      orderBy: 'SG.DateTime_UTC ASC',
      limit: 500,
    });

    // 2) Fallback por League (p.ej. "League of Legends Champions Korea")
    if (!rows.length) {
      rows = await this.lp.cargoQueryAll<LpGameRow>({
        tables: 'ScoreboardGames=SG,Tournaments=T',
        joinOn: 'SG.OverviewPage=T.OverviewPage',
        fields:
          'SG.GameId=GameId,SG.DateTime_UTC=DateTimeUTC,SG.Team1,SG.Team2,SG.WinTeam,SG.LossTeam,SG.Winner,SG.Patch,SG.OverviewPage=OverviewPage,T.Name=Tournament',
        where: makeWhere(`T.League LIKE "%${leagueNameLike}%"`),
        orderBy: 'SG.DateTime_UTC ASC',
        limit: 500,
      });
    }
    return rows;
  }

  async upsertGames(rows: LpGameRow[]) {
    if (!rows.length) return 0;

    // Pre-resuelve tournaments (OverviewPage → id)
    const overviews = Array.from(new Set(rows.map(r => r.OverviewPage).filter(Boolean))) as string[];
    const tournaments = overviews.length
      ? await this.tournamentRepo.find({ where: { overviewPage: In(overviews) } })
      : [];

    const tourIndex = new Map<string, number>();
    for (const t of tournaments) tourIndex.set(t.overviewPage.toLowerCase(), t.id);

    let count = 0;
    for (const g of rows) {
      const tId = g.OverviewPage ? tourIndex.get(g.OverviewPage.toLowerCase()) ?? null : null;

      await this.gameRepo.query(
        `
        INSERT INTO game (leaguepedia_game_id, datetime_utc, tournament_id, tournament_name, overview_page, patch,
                          team1_text, team2_text, win_team_text, loss_team_text, winner_number)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (leaguepedia_game_id) DO UPDATE SET
          datetime_utc = EXCLUDED.datetime_utc,
          tournament_id = EXCLUDED.tournament_id,
          tournament_name = EXCLUDED.tournament_name,
          overview_page = EXCLUDED.overview_page,
          patch = EXCLUDED.patch,
          team1_text = EXCLUDED.team1_text,
          team2_text = EXCLUDED.team2_text,
          win_team_text = EXCLUDED.win_team_text,
          loss_team_text = EXCLUDED.loss_team_text,
          winner_number = EXCLUDED.winner_number
        `,
        [
          g.GameId,
          toUtcDate(g.DateTimeUTC),
          tId,
          g.Tournament ?? null,
          g.OverviewPage ?? null,
          g.Patch ?? null,
          g.Team1 ?? null,
          g.Team2 ?? null,
          g.WinTeam ?? null,
          g.LossTeam ?? null,
          g.Winner ? Number(g.Winner) : null,
        ],
      );
      count++;
    }
    return count;
  }

  // ---------- LEAGUES: sembrar desde Tournaments ----------

/**
 * Devuelve ligas DISTINCT desde Tournaments para un año y/o filtro por nombre.
 * Útil para seed inicial de la tabla 'league'.
 */
  async fetchDistinctLeaguesFromTournaments(
  year?: number,
  officialOnly?: boolean,
  nameLike?: string, // opcional filtro por nombre/league (acepta patrón o code)
): Promise<Array<{ League: string; Region?: string; LeagueIconKey?: string; IsOfficial?: '0' | '1' }>> {
  const where: string[] = [];
  if (year) where.push(`Tournaments.Year="${year}"`);
  if (officialOnly != null) where.push(`Tournaments.IsOfficial="${officialOnly ? '1' : '0'}"`);

  if (nameLike) {
    // Aplicamos alias también aquí por si filtras por "LEC", etc.
    const aliases = leagueAliases(nameLike);
    const conds = aliases.map(a => `(Tournaments.Name LIKE "%${a}%" OR Tournaments.League LIKE "%${a}%")`);
    where.push(`(${conds.join(' OR ')})`);
  }

  const rows = await this.lp.cargoQueryAll<{ League: string; Region?: string; LeagueIconKey?: string; IsOfficial?: '0' | '1' }>({
    tables: 'Tournaments',
    fields: 'Tournaments.League=League,Tournaments.Region=Region,Tournaments.LeagueIconKey=LeagueIconKey,MAX(Tournaments.IsOfficial)=IsOfficial',
    where: where.length ? where.join(' AND ') : undefined,
    groupBy: 'Tournaments.League,Tournaments.Region,Tournaments.LeagueIconKey',
    orderBy: 'Tournaments.League ASC',
    limit: 500,
  });

  // Filtramos vacíos
  return rows.filter(r => r.League && r.League.trim() !== '');
}

private deriveLeagueCodeNameRegion(
  row: { League: string; Region?: string; LeagueIconKey?: string },
  overrideCode?: string,
  overrideRegion?: string,
) {
  const KNOWN: Record<string, { code: string; region: string }> = {
    'LoL EMEA Championship': { code: 'LEC', region: 'EMEA' },
    'League of Legends Champions Korea': { code: 'LCK', region: 'KR' },
    'League of Legends Pro League': { code: 'LPL', region: 'CN' },
    'League Championship Series': { code: 'LCS', region: 'NA' },
  };

  const name = row.League;
  const known = KNOWN[name];
  const code =
    overrideCode ??
    (known?.code ??
      (row.LeagueIconKey ? row.LeagueIconKey.toUpperCase() : name.replace(/[^A-Z]/g, '') || name.slice(0, 8).toUpperCase()));

  const region = overrideRegion ?? (known?.region ?? row.Region ?? null);

  return { code, name, region };
}

/**
 * Inserta/actualiza ligas en tabla 'league' a partir de Tournaments (DISTINCT League).
 * Puedes pasar overrideCode/overrideRegion cuando filtres por una liga concreta.
 */
  async upsertLeaguesFromTournaments(
    rows: Array<{ League: string; Region?: string; LeagueIconKey?: string; IsOfficial?: '0' | '1' }>,
    overrideCode?: string,
    overrideRegion?: string,
  ) {
    let upserts = 0;

    for (const r of rows) {
      const { code, name, region } = this.deriveLeagueCodeNameRegion(r, overrideCode, overrideRegion);
      // is_official: si no viene en el feed, no lo cambiamos (COALESCE en UPDATE)
      const isOfficial: boolean | null =
        r?.IsOfficial != null ? (String(r.IsOfficial) === '1') : null;

      // Upsert por LOWER(code)
      const existing = await this.tournamentRepo.manager.query(
        `SELECT id FROM league WHERE code IS NOT NULL AND LOWER(code)=LOWER($1) LIMIT 1`,
        [code],
      );

      if (existing?.[0]?.id) {
        await this.tournamentRepo.manager.query(
          `UPDATE league
            SET name = $1,
                region = $2,
                is_official = COALESCE($3, is_official),
                updated_at = NOW()
          WHERE id = $4`,
          [name, region, isOfficial, existing[0].id],
        );
      } else {
        await this.tournamentRepo.manager.query(
          `INSERT INTO league (code, name, region, is_official)
          VALUES ($1, $2, $3, $4)`,
          [code, name, region, isOfficial],
        );
      }

      upserts++;
    }

    return upserts;
  }


  // ------------------ Player Stats ------------------
  async fetchPlayerStatsByLeagueNameLike(
    leagueNameLike: string,
    from: string,
    to: string,
  ): Promise<LpPlayerGameStatRow[]> {
    const fields =
      'SP.Link=PlayerPage,SP.Team=Team,SP.Role=Role,' +
      'SP.Kills,SP.Deaths,SP.Assists,SP.Gold,SP.CS,SP.Champion,' +
      'SP.DateTime_UTC=DateTimeUTC,SP.GameId,SP.PlayerWin';

    // 1) Intento por T.Name (ej. "LEC 2025 Summer ...")
    const whereByName = [
      `T.Name LIKE "%${leagueNameLike}%"`,
      `SP.DateTime_UTC >= "${from}"`,
      `SP.DateTime_UTC <= "${to}"`,
    ].join(' AND ');

    let rows = await this.lp.cargoQueryAll<LpPlayerGameStatRow>({
      tables: 'ScoreboardPlayers=SP,Tournaments=T',
      joinOn: 'SP.OverviewPage=T.OverviewPage',
      fields,
      where: whereByName,
      limit: 500,
    });

    // 2) Si no hay filas, probar por T.League (ej. "LoL EMEA Championship")
    if (!rows.length) {
      const whereByLeague = [
        `T.League LIKE "%${leagueNameLike}%"`,
        `SP.DateTime_UTC >= "${from}"`,
        `SP.DateTime_UTC <= "${to}"`,
      ].join(' AND ');

      rows = await this.lp.cargoQueryAll<LpPlayerGameStatRow>({
        tables: 'ScoreboardPlayers=SP,Tournaments=T',
        joinOn: 'SP.OverviewPage=T.OverviewPage',
        fields,
        where: whereByLeague,
        limit: 500,
      });
    }

    // 3) Caso especial LEC 2025 → League = 'LoL EMEA Championship'
    if (!rows.length && leagueNameLike.toUpperCase() === 'LEC') {
      const whereLEC = [
        `T.League IN ("LEC","LoL EMEA Championship")`,
        `SP.DateTime_UTC >= "${from}"`,
        `SP.DateTime_UTC <= "${to}"`,
      ].join(' AND ');

      rows = await this.lp.cargoQueryAll<LpPlayerGameStatRow>({
        tables: 'ScoreboardPlayers=SP,Tournaments=T',
        joinOn: 'SP.OverviewPage=T.OverviewPage',
        fields,
        where: whereLEC,
        limit: 500,
      });
    }

    return rows;
  }

  async upsertPlayerStats(rows: LpPlayerGameStatRow[]) {
    if (!rows.length) return 0;

    // Pre-resuelve game.id por leaguepedia_game_id
    const gameIds = Array.from(new Set(rows.map(r => r.GameId)));
    const games = await this.gameRepo.find({ where: {} }); // evitamos IN masivo en ORM, resolvemos con query directa
    const gameIndex = new Map<string, number>();
    // Mejor: query directa
    const gameRows = await this.gameRepo.query(
      `SELECT id, leaguepedia_game_id FROM game WHERE leaguepedia_game_id = ANY($1)`,
      [gameIds],
    );
    for (const g of gameRows) gameIndex.set(g.leaguepedia_game_id, g.id);

    // Pre-resuelve player.id por leaguepedia_player_id (SP.Link)
    const playerPages = Array.from(new Set(rows.map(r => r.PlayerPage)));
    const playerRows = await this.playerRepo.query(
      `SELECT id, leaguepedia_player_id FROM player WHERE LOWER(leaguepedia_player_id) = ANY($1)`,
      [playerPages.map(p => p.toLowerCase())],
    );
    const playerIndex = new Map<string, number>();
    for (const p of playerRows) playerIndex.set((p.leaguepedia_player_id as string).toLowerCase(), p.id);

    // También resolvemos role.id por code normalizado (si quieres usarlo en roster luego)
    const roles = await this.roleRepo.find();
    const roleCodeToId = new Map(roles.map(r => [r.code, r.id]));

    let count = 0;
    for (const s of rows) {
      // Upsert player si no existe
      let playerId = playerIndex.get(s.PlayerPage.toLowerCase());
      if (!playerId) {
        const ins = await this.playerRepo.insert({
          leaguepediaPlayerId: s.PlayerPage,
          displayName: null,
          country: null,
          photoFile: null,
          photoUrl: null,
        });
        playerId = ins.identifiers?.[0]?.id as number;
        playerIndex.set(s.PlayerPage.toLowerCase(), playerId);
      }

      const gameId = gameIndex.get(s.GameId);
      if (!gameId) {
        // Si por algún motivo falta el juego, creamos un “placeholder” mínimo
        const insG = await this.gameRepo.insert({
          leaguepediaGameId: s.GameId,
          datetimeUtc: toUtcDate(s.DateTimeUTC),
          tournamentId: null,
          tournamentName: null,
          overviewPage: null,
          patch: null,
          team1Text: null,
          team2Text: null,
          winTeamText: null,
          lossTeamText: null,
          winnerNumber: null,
        });
        const newGid = insG.identifiers?.[0]?.id as number;
        gameIndex.set(s.GameId, newGid);
      }

      const gid = gameIndex.get(s.GameId)!;

      const k = toInt(s.Kills) ?? 0;
      const d = toInt(s.Deaths) ?? 0;
      const a = toInt(s.Assists) ?? 0;

      await this.statsRepo.query(
        `
        INSERT INTO player_game_stats
          (game_id, player_id, player_page_text, team_text, role, champion,
           kills, deaths, assists, gold, cs, player_win, result)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (game_id, player_id) DO UPDATE SET
          player_page_text = EXCLUDED.player_page_text,
          team_text = EXCLUDED.team_text,
          role = EXCLUDED.role,
          champion = EXCLUDED.champion,
          kills = EXCLUDED.kills,
          deaths = EXCLUDED.deaths,
          assists = EXCLUDED.assists,
          gold = EXCLUDED.gold,
          cs = EXCLUDED.cs,
          player_win = EXCLUDED.player_win,
          result = EXCLUDED.result
        `,
        [
          gid,
          playerId,
          s.PlayerPage ?? null,
          s.Team ?? null,
          s.Role ?? null,
          s.Champion ?? null,
          k, d, a,
          toInt(s.Gold),
          toInt(s.CS),
          toBoolYN(s.PlayerWin),
          s.PlayerWin ? (s.PlayerWin === 'Yes' ? 'W' : 'L') : null,
        ],
      );

      count++;
    }
    return count;
  }

  // ------------------ Roster derivado (ventana) ------------------

  /**
   * Obtiene “event feed” de posiciones jugadas por un equipo (ScoreboardPlayers)
   * desde una fecha (inclusive).
   */
  async fetchRosterWindow(teamName: string, sinceUtc: string) {
    const rows = await this.lp.cargoQueryAll<LpPlayerGameStatRow>({
      tables: 'ScoreboardPlayers=SP',
      fields: 'SP.Team=Team,SP.Link=PlayerPage,SP.Role=Role,SP.DateTime_UTC=DateTimeUTC,SP.GameId',
      where: `SP.Team="${teamName}" AND SP.DateTime_UTC >= "${sinceUtc}"`,
      orderBy: 'SP.DateTime_UTC DESC',
      limit: 500,
    });
    return rows;
  }

  /**
   * Deriva titulares por rol: más partidas en ventana y mínimo minGames.
   */
  private deriveStarters(rows: LpPlayerGameStatRow[], minGames = 2) {
    const countsByRolePlayer = new Map<string, Map<string, number>>();
    const lastSeen = new Map<string, string>();

    for (const r of rows) {
      const role = normalizeRole(r.Role);
      if (!role) continue;

      const byPlayer = countsByRolePlayer.get(role) ?? new Map<string, number>();
      byPlayer.set(r.PlayerPage, (byPlayer.get(r.PlayerPage) ?? 0) + 1);
      countsByRolePlayer.set(role, byPlayer);

      const prev = lastSeen.get(r.PlayerPage);
      if (!prev || prev < r.DateTimeUTC) lastSeen.set(r.PlayerPage, r.DateTimeUTC);
    }

    const starters = new Map<string, { playerPage: string; games: number }>();
    const countsFlat: Array<{ role: string; playerPage: string; games: number }> = [];

    for (const [role, byPlayer] of countsByRolePlayer) {
      let best: { playerPage: string; games: number } | null = null;
      for (const [p, g] of byPlayer) {
        countsFlat.push({ role, playerPage: p, games: g });
        if (!best || g > best.games) best = { playerPage: p, games: g };
      }
      if (best && best.games >= minGames) starters.set(role, best);
    }

    return {
      starters,
      countsFlat,
      lastSeen,                          // Map playerPage -> last datetime
      involvedPlayers: Array.from(new Set(countsFlat.map(c => c.playerPage))),
    };
  }

  /**
   * Aplica la derivación de roster a la BD: marca titulares/suplentes,
   * con protección: si derivedCount=0, no desactiva nada.
   */
  async recomputeCurrentRosterForTeam(teamName: string, sinceUtc: string, minGames = 2) {
    const rows = await this.fetchRosterWindow(teamName, sinceUtc);
    const { starters, countsFlat, lastSeen, involvedPlayers } = this.deriveStarters(rows, minGames);
    const derivedCount = involvedPlayers.length;

    const team = await this.teamRepo
      .createQueryBuilder('t')
      .where('LOWER(t.team_name) = LOWER(:n) OR LOWER(t.leaguepedia_team_page) = LOWER(:n)', { n: teamName })
      .getOne();

    if (!team) {
      this.logger.warn(`Equipo no encontrado: "${teamName}"`);
      return { updated: 0, derivedCount: 0 };
    }

    // Pre-resuelve role ids
    const roles = await this.roleRepo.find();
    const roleCodeToId = new Map(roles.map(r => [r.code, r.id]));

    let updated = 0;
    // Set de titulares por PlayerPage
    const starterPlayers = new Set(Array.from(starters.values()).map(s => s.playerPage));

    for (const c of countsFlat) {
      // Upsert jugador por leaguepedia_player_id (PlayerPage)
      const lpId = c.playerPage;
      let player = await this.playerRepo
        .createQueryBuilder('p')
        .where('LOWER(p.leaguepedia_player_id) = LOWER(:p)', { p: lpId })
        .getOne();

      if (!player) {
        const ins = await this.playerRepo.insert({
          leaguepediaPlayerId: lpId,
          displayName: null,
          country: null,
          photoFile: null,
          photoUrl: null,
        });
        player = { id: ins.identifiers?.[0]?.id } as Player;
      }

      const roleCode = normalizeRole(c.role);
      const roleId = roleCode ? roleCodeToId.get(roleCode) ?? null : null;
      const last = lastSeen.get(lpId);

      // Upsert en membership por (team_id, player_id)
      await this.tpmRepo.query(
        `
        INSERT INTO team_player_membership
          (team_id, player_id, main_role_id, is_current, is_substitute, last_seen_utc, games_window)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (team_id, player_id) DO UPDATE SET
          main_role_id = COALESCE(EXCLUDED.main_role_id, team_player_membership.main_role_id),
          is_current = EXCLUDED.is_current,
          is_substitute = EXCLUDED.is_substitute,
          last_seen_utc = GREATEST(team_player_membership.last_seen_utc, EXCLUDED.last_seen_utc),
          games_window = EXCLUDED.games_window
        `,
        [
          team.id,
          player.id,
          roleId,
          starterPlayers.has(lpId),           // titular
          !starterPlayers.has(lpId),          // suplente
          last ? toUtcDate(last) : new Date(),
          c.games,
        ],
      );
      updated++;
    }

    // Protección: solo desactivar si hubo derivación > 0
    if (derivedCount > 0) {
      await this.tpmRepo.query(
        `
        UPDATE team_player_membership tpm
        SET is_current = false, is_substitute = false
        WHERE tpm.team_id = $1
          AND tpm.player_id NOT IN (
            SELECT p.id FROM player p
            WHERE LOWER(p.leaguepedia_player_id) = ANY($2)
          )
        `,
        [team.id, involvedPlayers.map(p => p.toLowerCase())],
      );
    }

    return { updated, derivedCount };
  }

  
/**
 * Devuelve los PlayerPage (SP.Link) DISTINCT que han jugado en una liga (por nombre)
 * en un rango de fechas. Puedes añadir IsOfficial="1" si quieres filtrar.
 */

  async fetchDistinctPlayerPagesByLeagueNameLike(
    leagueNameLike: string,
    from: string,
    to: string,
    officialOnly?: boolean,
  ): Promise<string[]> {
    const aliases = leagueAliases(leagueNameLike);

    // Filtros anti-ruido comunes
    const commonFilters: string[] = [
      `SP.Link IS NOT NULL`,
      `(T.TournamentLevel="Primary" OR T.TournamentLevel IS NULL)`,
      `T.League NOT LIKE "%Challenger%"`,
      `T.Name   NOT LIKE "%Challenger%"`,
      `T.League NOT LIKE "%Challengers%"`,
      `T.Name   NOT LIKE "%Challengers%"`,
      `T.League NOT LIKE "%Academy%"`,
      `T.Name   NOT LIKE "%Academy%"`,
      `T.League NOT LIKE "%LDL%"`,
      `T.Name   NOT LIKE "%LDL%"`,
      `SP.DateTime_UTC >= "${from}"`,
      `SP.DateTime_UTC <= "${to}"`,
    ];
    // IsOfficial: si te lo pasan explícitamente, respétalo; si no, aplica "1" por defecto (opcional)
    if (officialOnly != null) {
      commonFilters.push(`T.IsOfficial="${officialOnly ? '1' : '0'}"`);
    } else {
      commonFilters.push(`T.IsOfficial="1"`);
    }

    // Intento LeagueIconKey primero si procede
    const tryIconKey = looksLikeLeagueIconKey(leagueNameLike);
    if (tryIconKey) {
      const iconKey = leagueNameLike.trim();
      const iconWhere = [`T.LeagueIconKey="${iconKey}"`, ...commonFilters].join(' AND ');
      try {
        const rowsIcon = await this.lp.cargoQueryAll<{ PlayerPage: string }>({
          tables: 'ScoreboardPlayers=SP,Tournaments=T',
          joinOn: 'SP.OverviewPage=T.OverviewPage',
          fields: 'SP.Link=PlayerPage',
          where: iconWhere,
          groupBy: 'SP.Link',
          orderBy: 'SP.Link ASC',
          limit: 500,
        });
        if (rowsIcon?.length) return rowsIcon.map(r => r.PlayerPage).filter(Boolean);
      } catch {
        // Fallback si el campo no existe
      }
    }

    // Fallback: OR de alias (siglas + nombre largo + literal)
    const conds = aliases.map(a => buildLeagueWhere(a));
    const orFamily = `(${conds.join(' OR ')})`;
    const finalWhere = [orFamily, ...commonFilters].join(' AND ');

    const rows = await this.lp.cargoQueryAll<{ PlayerPage: string }>({
      tables: 'ScoreboardPlayers=SP,Tournaments=T',
      joinOn: 'SP.OverviewPage=T.OverviewPage',
      fields: 'SP.Link=PlayerPage',
      where: finalWhere,
      groupBy: 'SP.Link',
      orderBy: 'SP.Link ASC',
      limit: 500,
    });

    return rows.map(r => r.PlayerPage).filter(Boolean);
  }


/**
 * Upsert de catálogo de jugadores (Players.*) para todos los PlayerPage encontrados
 * en la liga/rango. Resuelve foto con Image (imageinfo) o fallback pageimages.
 */
async upsertPlayersByLeagueNameLike(
  leagueNameLike: string,
  from: string,
  to: string,
  officialOnly?: boolean,
) {
  const pages = await this.fetchDistinctPlayerPagesByLeagueNameLike(leagueNameLike, from, to, officialOnly);
  if (!pages.length) return { discovered: 0, enriched: 0, upserts: 0 };

  // Para cada PlayerPage, pedimos su fila en Players
    const enriched: { PlayerPage: string; DisplayName?: string; Country?: string; PhotoFile?: string }[] = [];
    const misses: string[] = [];

    for (const page of pages) {
      // 1) Intenta sacar fila del cargo "Players" con fallbacks
      const row = await this.fetchPlayerFromPlayersTable(page).catch(() => null);

      if (row?.PlayerPage) {
        enriched.push(row);
      } else {
        // 2) Fallback "mínimo": usa el propio OverviewPage y ya resolveremos la foto por pageimages
        enriched.push({
          PlayerPage: page,
          DisplayName: page.replace(/_/g, ' '), // nombre legible
          Country: undefined,
          PhotoFile: undefined,
        });
        misses.push(page);
      }
      await new Promise(r => setTimeout(r, 60)); // rate limit
    }

    // Resolver imágenes (igual que ya hacías):
    const fileTitles = enriched.map(e => e.PhotoFile).filter(Boolean) as string[];
    const imageMap = await this.lp.resolveImageUrls(fileTitles);

    // Para los que no tengan PhotoFile, probamos pageimages (por PlayerPage)
    const noFilePages = enriched.filter(e => !e.PhotoFile).map(e => e.PlayerPage);
    const pageImageMap = await this.lp.resolvePageOriginalImages(noFilePages);


  let upserts = 0;
  for (const e of enriched) {
    const lpId = e.PlayerPage;
    const displayName = e.DisplayName ?? lpId;
    const country = e.Country ?? null;

    let photoUrl: string | null = null;
    let photoFile: string | null = e.PhotoFile ?? null;

    if (e.PhotoFile) {
      const key = e.PhotoFile.startsWith('File:') ? e.PhotoFile : `File:${e.PhotoFile}`;
      photoUrl = imageMap[key] ?? null;
    } else {
      photoUrl = pageImageMap[lpId] ?? null;
    }

    // Upsert por LOWER(leaguepedia_player_id)
    const existing = await this.playerRepo
      .createQueryBuilder('p')
      .where('LOWER(p.leaguepedia_player_id) = LOWER(:id)', { id: lpId })
      .getOne();

    if (existing) {
      await this.playerRepo.update({ id: existing.id }, {
        leaguepediaPlayerId: lpId,
        displayName,
        country,
        photoFile,
        photoUrl,
      });
    } else {
      await this.playerRepo.insert({
        leaguepediaPlayerId: lpId,
        displayName,
        country,
        photoFile,
        photoUrl,
      });
    }
    upserts++;
  }
  return { discovered: pages.length, enriched: enriched.length, upserts };
}

  // Util para escapar comillas
  private escapeCargo(s: string): string {
    return s.replace(/"/g, '\\"');
  }

  private async fetchPlayerFromPlayersTable(page: string): Promise<{ PlayerPage: string; DisplayName?: string; Country?: string; PhotoFile?: string } | null> {
    const esc = (s: string) => `"${this.escapeCargo(s)}"`;

    const q = (where: string) =>
      this.lp.cargoQuery<CargoResponse<{ PlayerPage: string; DisplayName?: string; Country?: string; PhotoFile?: string }>>({
        tables: 'Players',
        fields: 'Players.OverviewPage=PlayerPage,Players.ID=DisplayName,Players.NationalityPrimary=Country,Players.Image=PhotoFile',
        where,
        limit: 1,
      }) as any;

    const name = page.trim();

    // 1) OverviewPage exacto (tu intento actual)
    let res = await q(`Players.OverviewPage=${esc(name)}`);
    if (res?.cargoquery?.[0]?.title?.PlayerPage) return res.cargoquery[0].title;

    // 2) OverviewPage con underscores (MediaWiki normaliza espacios a "_")
    const withUnderscores = name.replace(/ /g, '_');
    if (withUnderscores !== name) {
      res = await q(`Players.OverviewPage=${esc(withUnderscores)}`);
      if (res?.cargoquery?.[0]?.title?.PlayerPage) return res.cargoquery[0].title;
    }

    // 3) ID exacto (hay casos donde el ID coincide con el título del link)
    res = await q(`Players.ID=${esc(name)}`);
    if (res?.cargoquery?.[0]?.title?.PlayerPage) return res.cargoquery[0].title;

    // 4) Desambiguaciones típicas: "Nombre (player)" / "Nombre (League of Legends player)" / región
    //    Probamos OverviewPage que empiece por el nombre base
    const base = name.replace(/_/g, ' ');
    res = await q(`Players.OverviewPage LIKE ${esc(`${base}%`)}`);
    if (res?.cargoquery?.[0]?.title?.PlayerPage) return res.cargoquery[0].title;

    // Sin match en tabla Players
    return null;
  }

}