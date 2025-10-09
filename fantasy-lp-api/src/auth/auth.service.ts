import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FantasyManager } from '../fantasy/leagues/fantasy-manager.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

export interface RegisterDto {
  displayName: string;
  email: string;
  password: string;
  role?: 'manager' | 'admin';
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateProfileDto {
  displayName?: string;
  email?: string;
  password?: string;
}

export interface RefreshDto { refreshToken: string }

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(FantasyManager) private readonly managers: Repository<FantasyManager>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const exists = await this.managers.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Email ya registrado');
    const hash = await bcrypt.hash(dto.password, 10);
    const role = dto.role && process.env.ALLOW_REGISTER_ADMIN === 'true' ? dto.role : 'manager';
    const entity = this.managers.create({ displayName: dto.displayName, email, passwordHash: hash, role });
    const saved = await this.managers.save(entity);
    const token = this.signToken(saved);
    return { access_token: token, payload: this.payload(saved) };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.managers.findOne({ where: { email } });
    if (!user?.passwordHash) throw new UnauthorizedException('Credenciales inválidas');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');
    // Emitir access y refresh; guardar hash del refresh para rotación
    const { access, refresh } = this.issueTokens(user);
    user.refreshTokenHash = await bcrypt.hash(refresh, 10);
    await this.managers.save(user);
    return { access_token: access, refresh_token: refresh, payload: this.payload(user) };
  }

  private payload(u: FantasyManager) {
    return { sub: u.id, name: u.displayName, leagueId: null, teamId: null, role: u.role ?? 'manager' };
  }
  private signToken(u: FantasyManager) { return this.jwt.sign(this.payload(u)); }
  private issueTokens(u: FantasyManager) {
    const access = this.jwt.sign(this.payload(u));
    const refreshPayload = { sub: u.id, type: 'refresh' };
    const refresh = this.jwt.sign(refreshPayload, { expiresIn: '30d' });
    return { access, refresh };
  }

  async me(userId: number) {
    const u = await this.managers.findOne({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    return { id: u.id, displayName: u.displayName, email: u.email, role: u.role };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const u = await this.managers.findOne({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    if (dto.email) {
      const email = dto.email.toLowerCase();
      const exists = await this.managers.findOne({ where: { email } });
      if (exists && exists.id !== userId) throw new BadRequestException('Email ya en uso');
      u.email = email;
    }
    if (dto.displayName) u.displayName = dto.displayName;
    if (dto.password) u.passwordHash = await bcrypt.hash(dto.password, 10);
    await this.managers.save(u);
    return { id: u.id, displayName: u.displayName, email: u.email, role: u.role };
  }

  async refresh(userId: number, dto: RefreshDto) {
    const u = await this.managers.findOne({ where: { id: userId } });
    if (!u?.refreshTokenHash) throw new UnauthorizedException('Refresh inválido');
    const ok = await bcrypt.compare(dto.refreshToken, u.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Refresh inválido');
    const { access, refresh } = this.issueTokens(u);
    u.refreshTokenHash = await bcrypt.hash(refresh, 10);
    await this.managers.save(u);
    return { access_token: access, refresh_token: refresh };
  }
}
