import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FantasyManager } from '../fantasy/leagues/fantasy-manager.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { FantasyTeam } from '../fantasy/teams/fantasy-team.entity';
import { FantasyLeague } from '../fantasy/leagues/fantasy-league.entity';

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
    @InjectRepository(FantasyTeam) private readonly teams: Repository<FantasyTeam>,
    @InjectRepository(FantasyLeague) private readonly leagues: Repository<FantasyLeague>,
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
    const memberships = await this.memberships(userId);
    return { id: u.id, displayName: u.displayName, email: u.email, role: u.role, memberships };
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

  async refresh(userId: number | undefined, dto: RefreshDto) {
    // Si no viene userId (no access token), intentar derivarlo del refresh token
    let targetUserId = userId;
    if (!targetUserId) {
      try {
        const decoded: any = this.jwt.verify(dto.refreshToken);
        if (decoded?.type !== 'refresh' || !decoded?.sub) throw new Error('invalid');
        targetUserId = Number(decoded.sub);
      } catch (e) {
        throw new UnauthorizedException('Refresh inválido');
      }
    }
    const u = await this.managers.findOne({ where: { id: targetUserId } });
    if (!u?.refreshTokenHash) throw new UnauthorizedException('Refresh inválido');
    const ok = await bcrypt.compare(dto.refreshToken, u.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Refresh inválido');
    const { access, refresh } = this.issueTokens(u);
    u.refreshTokenHash = await bcrypt.hash(refresh, 10);
    await this.managers.save(u);
    return { access_token: access, refresh_token: refresh };
  }

  /** Devuelve las ligas/equipos a los que pertenece este manager. */
  async memberships(userId: number) {
    if (!userId || isNaN(Number(userId))) return [];
    const rows = await this.teams.createQueryBuilder('t')
      .innerJoinAndSelect('t.fantasyLeague', 'l')
      .innerJoin('t.fantasyManager', 'm')
      .where('m.id = :uid', { uid: userId })
      .select([
        't.id AS team_id',
        't.name AS team_name',
        'l.id AS league_id',
        'l.name AS league_name',
        'l.sourceLeagueCode AS source_league_code',
      ])
      .getRawMany();
    return rows.map((r) => ({
      teamId: Number(r.team_id),
      teamName: r.team_name,
      leagueId: Number(r.league_id),
      leagueName: r.league_name,
      sourceLeagueCode: r.source_league_code || null,
    }));
  }

  /** Emite un access token con contexto de liga/equipo del manager. */
  async selectContext(userId: number, leagueId: number) {
    const team = await this.teams.findOne({
      where: {
        fantasyManager: { id: userId } as any,
        fantasyLeague: { id: leagueId } as any,
      },
      relations: { fantasyManager: true, fantasyLeague: true },
    });
    if (!team) throw new UnauthorizedException('No perteneces a esta liga');
    const manager = team.fantasyManager as FantasyManager;
    const payload = { sub: manager.id, name: manager.displayName, role: manager.role ?? 'manager', leagueId, teamId: team.id };
    const access_token = this.jwt.sign(payload);
    return { access_token, payload };
  }
}
