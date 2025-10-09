import { Body, Controller, ForbiddenException, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import type { LoginDto, RegisterDto, UpdateProfileDto, RefreshDto } from './auth.service';
import { User } from './user.decorator';
import type { AuthUser } from './user.decorator';

type DevLoginDto = {
  userId: number;
  teamId?: number;
  leagueId?: number;
  name?: string;
};

@ApiTags('Auth')
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string', example: 'Faker' },
        email: { type: 'string', example: 'faker@example.com' },
        password: { type: 'string', example: 'secret123' },
        role: { type: 'string', enum: ['manager', 'admin'], example: 'manager' },
      },
      required: ['displayName', 'email', 'password'],
    },
  })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  // Login por email/password
  @Public()
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'faker@example.com' },
        password: { type: 'string', example: 'secret123' },
      },
      required: ['email', 'password'],
    },
  })
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  // Perfil actual
  @ApiBearerAuth('bearer')
  @Get('me')
  me(@User() user?: AuthUser) {
    return this.auth.me(Number(user?.userId));
  }

  @ApiBearerAuth('bearer')
  @Put('me')
  updateMe(@Body() body: UpdateProfileDto, @User() user?: AuthUser) {
    return this.auth.updateProfile(Number(user?.userId), body);
  }

  // Refresh tokens: permite usar sólo el refresh token (Bearer refresh no requerido)
  @Public()
  @Post('refresh')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
      required: ['refreshToken'],
    },
  })
  refresh(@Body() body: RefreshDto, @User() user?: AuthUser) {
    return this.auth.refresh(user?.userId ? Number(user.userId) : undefined, body);
  }

  // Discovery: listar ligas/equipos del manager autenticado
  @ApiBearerAuth('bearer')
  @Get('memberships')
  memberships(@User() user?: AuthUser) {
    return this.auth.memberships(Number(user?.userId));
  }

  // Seleccionar contexto de liga: genera access con leagueId/teamId inferidos
  @ApiBearerAuth('bearer')
  @Post('context/select')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { leagueId: { type: 'number', example: 1 } },
      required: ['leagueId'],
    },
  })
  selectContext(@Body('leagueId') leagueId: number, @User() user?: AuthUser) {
    return this.auth.selectContext(Number(user?.userId), Number(leagueId));
  }
}
