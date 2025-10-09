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
    const token = this.signToken(user);
    return { access_token: token, payload: this.payload(user) };
  }

  private payload(u: FantasyManager) {
    return { sub: u.id, name: u.displayName, leagueId: null, teamId: null, role: u.role ?? 'manager' };
  }
  private signToken(u: FantasyManager) { return this.jwt.sign(this.payload(u)); }
}
