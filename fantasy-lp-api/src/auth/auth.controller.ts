import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type DevLoginDto = {
  userId: number;
  teamId?: number;
  leagueId?: number;
  name?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly jwt: JwtService) {}

  @Post('dev-login')
  devLogin(@Body() body: DevLoginDto) {
    // Restringir en producción
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN === 'false') {
      throw new ForbiddenException('dev-login deshabilitado en producción');
    }

    const payload = {
      sub: body.userId,
      teamId: body.teamId ?? null,
      leagueId: body.leagueId ?? null,
      name: body.name ?? 'dev-user',
      role: 'dev',
    };
    const access_token = this.jwt.sign(payload);
    return { access_token, payload };
  }
}
