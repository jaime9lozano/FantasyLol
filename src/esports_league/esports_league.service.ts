import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EsportsLeague } from './entities/esports_league.entity';
import { CreateEsportsLeagueDto } from './dto/create-esports_league.dto';
import { UpdateEsportsLeagueDto } from './dto/update-esports_league.dto';
import { ListEsportsLeagueQueryDto } from './dto/list-esports_league-query.dto';

@Injectable()
export class EsportsLeagueService {
  constructor(
    @InjectRepository(EsportsLeague)
    private readonly leagueRepo: Repository<EsportsLeague>,
  ) {}

  async create(dto: CreateEsportsLeagueDto): Promise<EsportsLeague> {
    try {
      const league = this.leagueRepo.create(dto);
      return await this.leagueRepo.save(league);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('La liga ya existe');
      }
      throw e;
    }
  }

  async findAll(query: ListEsportsLeagueQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const qb = this.leagueRepo.createQueryBuilder('league');

    if (includeDeleted !== 'true') {
      qb.andWhere('league.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere('league.name ILIKE :s OR league.slug ILIKE :s', {
        s: `%${search}%`,
      });
    }

    qb.orderBy(`league.${sortBy}`, order).skip((page - 1) * limit).take(limit);

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

  async findOne(id: string): Promise<EsportsLeague> {
    const league = await this.leagueRepo.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!league) throw new NotFoundException('Liga no encontrada');
    return league;
  }

  async update(id: string, dto: UpdateEsportsLeagueDto): Promise<EsportsLeague> {
    const league = await this.findOne(id);
    Object.assign(league, dto);
    try {
      return await this.leagueRepo.save(league);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('La liga ya existe');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.leagueRepo.softDelete({ id });
    if (result.affected === 0) throw new NotFoundException('Liga no encontrada');
  }

  async reactivate(id: string): Promise<EsportsLeague> {
    await this.leagueRepo.restore({ id });
    return this.findOne(id);
  }

  async findDeleted(query: Omit<ListEsportsLeagueQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.leagueRepo
      .createQueryBuilder('league')
      .where('league.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere('league.name ILIKE :s OR league.slug ILIKE :s', {
        s: `%${search}%`,
      });
    }

    qb.orderBy(`league.${sortBy}`, order).skip((page - 1) * limit).take(limit);

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
    const result = await this.leagueRepo.delete({ id });
    if (result.affected === 0) throw new NotFoundException('Liga no encontrada');
  }
}