import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { OptionalJwtAuthGuard } from './optional-jwt.guard';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private optionalJwt: OptionalJwtAuthGuard) {}
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return this.optionalJwt.canActivate(context);
  }
}
