import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { T } from '../database/schema.util';

@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const enable = process.env.ENABLE_AUTH?.toLowerCase() === 'true';
    if (!enable) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    // Si no hay user, ya fallará el OptionalJwtAuthGuard; aquí validamos pertenencia contextual
    if (!user) return true;

    // Inferir leagueId y teamId desde params/query/body segun ruta
    const params = req.params || {};
    const query = req.query || {};
    const body = req.body || {};
    const base: string = (req.baseUrl || req.path || req.originalUrl || '').toString();
    const method: string = (req.method || 'GET').toString().toUpperCase();

    let targetLeagueId: number = NaN;
    let targetTeamId: number = NaN;

    if (/\/fantasy\/leagues\b/.test(base)) {
      // Rutas de liga: :id es leagueId
      targetLeagueId = Number(params.leagueId ?? params.id ?? query.leagueId ?? body.leagueId);
      // teamId solo si viene explícito en query/body
      targetTeamId = Number(params.teamId ?? query.teamId ?? body.teamId);
    } else if (/\/fantasy\/teams\b/.test(base)) {
      // Rutas de equipo: :id es teamId
      targetTeamId = Number(params.teamId ?? params.id ?? body.teamId);
      // leagueId si viene (algunas consultas lo pasan)
      targetLeagueId = Number(params.leagueId ?? query.leagueId ?? body.leagueId);
    } else {
      // Fallback genérico
      targetLeagueId = Number(params.leagueId ?? query.leagueId ?? body.leagueId);
      targetTeamId = Number(params.teamId ?? body.teamId);
    }

    // Permitir lectura de roster de otros equipos si es GET y ruta de roster
    const isTeamRosterRead = method === 'GET' && /\/fantasy\/teams\/.+\/roster(\/compact)?\b/.test(base);
    if (isTeamRosterRead && !Number.isNaN(targetTeamId) && user.leagueId) {
      // Verificamos que el equipo pertenece a la misma liga del usuario
      const rows = await this.ds.query(
        `SELECT fantasy_league_id FROM ${T('fantasy_team')} WHERE id = $1`,
        [Number(targetTeamId)],
      );
      const teamLeagueId = rows[0]?.fantasy_league_id ? Number(rows[0].fantasy_league_id) : NaN;
      if (!Number.isNaN(teamLeagueId) && Number(user.leagueId) === teamLeagueId) {
        // Permitimos ver roster ajeno de la misma liga
        return true;
      }
      throw new ForbiddenException('No perteneces a esta liga');
    }

    if (!Number.isNaN(targetLeagueId) && user.leagueId && Number(user.leagueId) !== targetLeagueId) {
      throw new ForbiddenException('No perteneces a esta liga');
    }
    if (!Number.isNaN(targetTeamId) && user.teamId && Number(user.teamId) !== targetTeamId) {
      throw new ForbiddenException('No perteneces a este equipo');
    }
    return true;
  }
}
