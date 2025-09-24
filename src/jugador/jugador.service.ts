import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { CreateJugadorDto } from "./dto/create-jugador.dto";
import { ListJugadorQueryDto } from "./dto/list-jugador-query.dto";
import { UpdateJugadorDto } from "./dto/update-jugador.dto";
import { Jugador } from "./entities/jugador.entity";

@Injectable()
export class JugadorService {
  constructor(
    @InjectRepository(Jugador)
    private readonly jugadorRepository: Repository<Jugador>,
  ) {}

  async create(dto: CreateJugadorDto): Promise<Jugador> {
    try {
      const jugador = this.jugadorRepository.create(dto);
      return await this.jugadorRepository.save(jugador);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('Jugador duplicado');
      }
      throw e;
    }
  }

  async findAll(query: ListJugadorQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const qb = this.jugadorRepository.createQueryBuilder('jugador');

    if (includeDeleted !== 'true') {
      qb.andWhere('jugador.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere('jugador.display_name ILIKE :s OR jugador.summoner_name ILIKE :s', {
        s: `%${search}%`,
      });
    }

    qb.orderBy(`jugador.${sortBy}`, order);

    qb.skip((page - 1) * limit).take(limit);

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

  async findOne(id: number): Promise<Jugador> {
    const jugador = await this.jugadorRepository.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!jugador) throw new NotFoundException('Jugador no encontrado');
    return jugador;
  }

  async update(id: number, dto: UpdateJugadorDto): Promise<Jugador> {
    const jugador = await this.findOne(id);
    Object.assign(jugador, dto);
    try {
      return await this.jugadorRepository.save(jugador);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('Jugador duplicado');
      }
      throw e;
    }
  }

  async remove(id: number): Promise<void> {
    const result = await this.jugadorRepository.softDelete({ id });
    if (result.affected === 0) throw new NotFoundException('Jugador no encontrado');
  }

  async reactivate(id: number): Promise<Jugador> {
    await this.jugadorRepository.restore({ id });
    return this.findOne(id);
  }

  async findDeleted(query: Omit<ListJugadorQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.jugadorRepository
      .createQueryBuilder('jugador')
      .where('jugador.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere('jugador.display_name ILIKE :s OR jugador.summoner_name ILIKE :s', {
        s: `%${search}%`,
      });
    }

    qb.orderBy(`jugador.${sortBy}`, order).skip((page - 1) * limit).take(limit);

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

  async hardDelete(id: number): Promise<void> {
    const result = await this.jugadorRepository.delete({ id });
    if (result.affected === 0) throw new NotFoundException('Jugador no encontrado');
  }
}
