import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: number;
  teamId?: number | null;
  leagueId?: number | null;
  name?: string;
  role?: string;
  // payload extra permisivo
  [k: string]: any;
}

export const User = createParamDecorator((data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return req?.user as AuthUser | undefined;
});
