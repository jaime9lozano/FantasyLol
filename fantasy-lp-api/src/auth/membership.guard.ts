import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class MembershipGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
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

    if (!Number.isNaN(targetLeagueId) && user.leagueId && Number(user.leagueId) !== targetLeagueId) {
      throw new ForbiddenException('No perteneces a esta liga');
    }
    if (!Number.isNaN(targetTeamId) && user.teamId && Number(user.teamId) !== targetTeamId) {
      throw new ForbiddenException('No perteneces a este equipo');
    }
    return true;
  }
}
