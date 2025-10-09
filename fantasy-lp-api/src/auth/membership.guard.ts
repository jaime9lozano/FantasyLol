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
    const targetLeagueId = Number(params.id ?? params.leagueId ?? query.leagueId ?? body.leagueId);
    const targetTeamId = Number(params.id ?? params.teamId ?? body.teamId);

    if (!Number.isNaN(targetLeagueId) && user.leagueId && Number(user.leagueId) !== targetLeagueId) {
      throw new ForbiddenException('No perteneces a esta liga');
    }
    if (!Number.isNaN(targetTeamId) && user.teamId && Number(user.teamId) !== targetTeamId) {
      throw new ForbiddenException('No perteneces a este equipo');
    }
    return true;
  }
}
