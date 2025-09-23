import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { ListRegionQueryDto } from './dto/list-region-query.dto';

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
  ) {}

  private normalizeName(name: string) {
    return name.trim();
  }

  private async ensureUniqueName(name: string, excludeId?: number) {
    const normalized = this.normalizeName(name);
    const existing = await this.regionRepository.findOne({
      where: excludeId
        ? { name: normalized, id: Not(excludeId) as any }
        : { name: normalized },
      withDeleted: true, // detecta duplicados aunque estén soft-deleted
    });

    if (existing) {
      throw new ConflictException('Ya existe una región con ese nombre');
    }
  }

  async create(dto: CreateRegionDto): Promise<Region> {
    const name = this.normalizeName(dto.name);
    await this.ensureUniqueName(name);
    try {
      const region = this.regionRepository.create({ name });
      return await this.regionRepository.save(region);
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new ConflictException('El nombre de la región ya existe');
      }
      throw e;
    }
  }

  async findAll(query: ListRegionQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const qb = this.regionRepository.createQueryBuilder('region');

    if (includeDeleted !== 'true') {
      qb.andWhere('region.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere('region.name ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`region.${sortBy}`, order as 'ASC' | 'DESC');

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

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

  async findDeleted(query: Omit<ListRegionQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.regionRepository
      .createQueryBuilder('region')
      .where('region.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere('region.name ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`region.${sortBy}`, order as 'ASC' | 'DESC');

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

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

  async findOne(id: number): Promise<Region> {
    const region = await this.regionRepository.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!region) {
      throw new NotFoundException('Región no encontrada o eliminada');
    }
    return region;
  }

  async update(id: number, dto: UpdateRegionDto): Promise<Region> {
    const region = await this.findOne(id);

    if (dto.name) {
      const name = this.normalizeName(dto.name);
      await this.ensureUniqueName(name, id);
      region.name = name;
      delete (dto as any).name;
    }

    // Nota: no permitimos setear eliminated manualmente
    return this.regionRepository.save({ ...region, ...dto });
  }

  /** Soft delete */
  async remove(id: number): Promise<void> {
    const res = await this.regionRepository.softDelete({ id });
    if (res.affected === 0) {
      throw new NotFoundException('Región no encontrada');
    }
  }

  async reactivate(id: number): Promise<Region> {
    const exists = await this.regionRepository.findOne({ where: { id }, withDeleted: true });
    if (!exists) throw new NotFoundException('Región no encontrada');

    // Validar que no choque con otra región activa con el mismo nombre
    await this.ensureUniqueName(exists.name, id);

    await this.regionRepository.restore({ id });
    return this.findOne(id);
  }

  /** Hard delete definitivo (fallará si hay equipos referenciando la región) */
  async hardDelete(id: number): Promise<void> {
    try {
      const res = await this.regionRepository.delete({ id });
      if (res.affected === 0) {
        throw new NotFoundException('Región no encontrada');
      }
    } catch (e: any) {
      if (e?.code === '23503') {
        // Violación de foreign key (equipos asociados)
        throw new ConflictException(
          'No se puede borrar la región porque tiene equipos asociados',
        );
      }
      throw e;
    }
  }
}
