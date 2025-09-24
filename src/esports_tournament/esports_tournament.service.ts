import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EsportsTournament } from './entities/esports_tournament.entity';
import { CreateEsportsTournamentDto } from './dto/create-esports_tournament.dto';
import { UpdateEsportsTournamentDto } from './dto/update-esports_tournament.dto';
import { ListEsportsTournamentQueryDto } from './dto/list-esports_tournament-query.dto';

@Injectable()
export class EsportsTournamentService {
  constructor(
    @InjectRepository(EsportsTournament)
    private readonly tournamentRepo: Repository<EsportsTournament>,
  ) {}

  async create(dto: CreateEsportsTournamentDto): Promise<EsportsTournament> {
    try {
      // TypeORM aceptará start_date / end_date como string ISO; si prefieres, convierto:
      const tournament = this.tournamentRepo.create({
        ...dto,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
      });
      return await this.tournamentRepo.save(tournament);
    } catch (e: any) {
      // 23505: unique_violation
      if (e.code === '23505') {
        throw new ConflictException('El torneo ya existe');
      }
      // 23503: foreign_key_violation (league_id inexistente)
      if (e.code === '23503') {
        throw new BadRequestException('La liga especificada no existe');
      }
      throw e;
    }
  }

  async findAll(query: ListEsportsTournamentQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const qb = this.tournamentRepo.createQueryBuilder('t');

    if (includeDeleted !== 'true') {
      qb.andWhere('t.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere('t.name ILIKE :s OR t.slug ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`t.${sortBy}`, order as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<EsportsTournament> {
    const tournament = await this.tournamentRepo.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    return tournament;
  }

  async update(id: string, dto: UpdateEsportsTournamentDto): Promise<EsportsTournament> {
    const tournament = await this.findOne(id);

    // Convertir fechas si vienen en string ISO
    const patch: Partial<EsportsTournament> = {
      ...dto,
      start_date: dto.start_date ? new Date(dto.start_date) : tournament.start_date,
      end_date: dto.end_date ? new Date(dto.end_date) : tournament.end_date,
      // eliminated lo controla TypeORM en softDelete/restore; si lo pasas, lo asigno:
      eliminated: (dto as any).eliminated
        ? new Date(dto.eliminated as string)
        : (dto as any).eliminated ?? tournament.eliminated,
    };

    Object.assign(tournament, patch);

    try {
      return await this.tournamentRepo.save(tournament);
    } catch (e: any) {
      if (e.code === '23505') {
        throw new ConflictException('El torneo ya existe');
      }
      if (e.code === '23503') {
        throw new BadRequestException('La liga especificada no existe');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.tournamentRepo.softDelete({ id });
    if (result.affected === 0) throw new NotFoundException('Torneo no encontrado');
  }

  async reactivate(id: string): Promise<EsportsTournament> {
    await this.tournamentRepo.restore({ id });
    return this.findOne(id);
  }

  async findDeleted(query: Omit<ListEsportsTournamentQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.tournamentRepo
      .createQueryBuilder('t')
      .where('t.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere('t.name ILIKE :s OR t.slug ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`t.${sortBy}`, order as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async hardDelete(id: string): Promise<void> {
    const result = await this.tournamentRepo.delete({ id });
    if (result.affected === 0) throw new NotFoundException('Torneo no encontrado');
  }
}

