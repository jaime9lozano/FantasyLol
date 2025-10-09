import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import type { LoginDto, RegisterDto } from './auth.service';

type DevLoginDto = {
  userId: number;
  teamId?: number;
  leagueId?: number;
  name?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly jwt: JwtService, private readonly auth: AuthService) {}

  @Public()
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

  // Registro público de managers; el rol admin sólo si ALLOW_REGISTER_ADMIN=true
  @Public()
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  // Login por email/password
  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
