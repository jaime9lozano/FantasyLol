import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard que aplica JWT si ENABLE_AUTH=true; si no, permite paso sin req.user
@Injectable()
export class OptionalJwtAuthGuard extends (AuthGuard('jwt') as { new (): CanActivate }) {
  canActivate(context: ExecutionContext) {
    const enable = process.env.ENABLE_AUTH?.toLowerCase() === 'true';
    if (!enable) return true;
    return super.canActivate(context) as any;
  }
}
