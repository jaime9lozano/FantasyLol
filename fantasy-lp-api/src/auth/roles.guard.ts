import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, RoleValue } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const enable = process.env.ENABLE_AUTH?.toLowerCase() === 'true';
    // Si auth está deshabilitado, no forzar roles.
    if (!enable) return true;

    const required = this.reflector.getAllAndOverride<RoleValue[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req?.user as { role?: string } | undefined;
    if (!user?.role) return false;
    return required.includes(user.role as RoleValue);
  }
}
