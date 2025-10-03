// src/fantasy/leagues/fantasy-leagues.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { FantasyLeague } from './fantasy-league.entity';
import { FantasyManager } from './fantasy-manager.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { CreateFantasyLeagueDto } from './dto/create-fantasy-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';

function genInviteCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
  return out;
}

@Injectable()
export class FantasyLeaguesService {
  constructor(
    @InjectRepository(FantasyLeague) private leagues: Repository<FantasyLeague>,
    @InjectRepository(FantasyManager) private managers: Repository<FantasyManager>,
    @InjectRepository(FantasyTeam) private teams: Repository<FantasyTeam>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  async createLeague(adminManagerId: number, dto: CreateFantasyLeagueDto) {
    const admin = await this.managers.findOne({ where: { id: adminManagerId } });
    if (!admin) throw new BadRequestException('Manager no existe');

    const invite = genInviteCode();
    const league = this.leagues.create({
      name: dto.name,
      inviteCode: invite,
      adminManager: admin,
      initialBudget: String(dto.initialBudget ?? 100_000_000),
      clauseMultiplier: String(dto.clauseMultiplier ?? 1.5),
      marketCloseTime: dto.marketCloseTime ?? '20:00',
      timezone: dto.timezone ?? 'Europe/Madrid',
      scoringConfig: dto.scoringConfig ?? { kill: 3, assist: 2, death: -1, cs10: 0.5, win: 2 },
      rosterConfig: dto.rosterConfig ?? { slots: ['TOP','JNG','MID','ADC','SUP'], bench: 2 },
    });
    return this.leagues.save(league);
  }

  async joinLeague(dto: JoinLeagueDto) {
    return this.ds.transaction(async trx => {
      const league = await trx.findOne(FantasyLeague, { where: { inviteCode: dto.inviteCode } });
      if (!league) throw new BadRequestException('Invite code inválido');

      const mgr = await trx.findOne(FantasyManager, { where: { id: dto.fantasyManagerId } });
      if (!mgr) throw new BadRequestException('Manager inválido');

      const exists = await trx.findOne(FantasyTeam, { where: { fantasyLeague: { id: league.id } as any, fantasyManager: { id: mgr.id } as any } });
      if (exists) throw new BadRequestException('Ya estás en esta liga');

      const team = trx.create(FantasyTeam, {
        fantasyLeague: league,
        fantasyManager: mgr,
        name: dto.teamName,
        budgetRemaining: String(league.initialBudget),
        budgetReserved: '0',
        pointsTotal: '0',
      });
      await trx.save(team);
      return { leagueId: league.id, teamId: team.id, budgetRemaining: team.budgetRemaining };
    });
  }

  async ranking(leagueId: number) {
    const rows = await this.ds.query(`
      SELECT ft.id, ft.name, ft.points_total, fm.display_name
      FROM public.fantasy_team ft
      JOIN public.fantasy_manager fm ON fm.id = ft.fantasy_manager_id
      WHERE ft.fantasy_league_id = $1
      ORDER BY ft.points_total DESC, ft.name ASC
    `, [leagueId]);
    return rows;
  }

  async updateLeague(leagueId: number, dto: UpdateLeagueDto) {
    const league = await this.leagues.findOne({ where: { id: leagueId } });
    if (!league) throw new BadRequestException('Liga no encontrada');
    Object.assign(league, {
      name: dto.name ?? league.name,
      timezone: dto.timezone ?? league.timezone,
      marketCloseTime: dto.marketCloseTime ?? league.marketCloseTime,
      clauseMultiplier: dto.clauseMultiplier?.toString() ?? league.clauseMultiplier,
      scoringConfig: dto.scoringConfig ?? league.scoringConfig,
      rosterConfig: dto.rosterConfig ?? league.rosterConfig,
    });
    return this.leagues.save(league);
  }
}
