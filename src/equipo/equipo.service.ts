import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Equipo } from './entities/equipo.entity';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { Region } from 'src/region/entities/region.entity';
import { ListEquipoQueryDto } from './dto/list-equipo-query.dto';

@Injectable()
export class EquipoService {
  constructor(
    @InjectRepository(Equipo)
    private readonly equipoRepository: Repository<Equipo>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
  ) {}

  async findByRegion(regionId: number): Promise<Equipo[]> {
  return this.equipoRepository.find({
    where: { Region_id: regionId, eliminated: IsNull() },
    relations: ['region'],
    order: { id: 'ASC' },
  });
}


  /** Helper: asegura que la región existe y no está eliminada */
  private async ensureActiveRegion(regionId: number) {
    const region = await this.regionRepository.findOne({
      where: { id: regionId, eliminated: IsNull() as any },
    });
    if (!region) {
      throw new BadRequestException('La región no existe o está eliminada');
    }
    return region;
  }

  async create(createEquipoDto: CreateEquipoDto): Promise<Equipo> {
    await this.ensureActiveRegion(createEquipoDto.Region_id);

    // Si en el futuro agregas UNIQUE en acronym/team_name, captura errores 23505:
    // try { ... } catch (e) { if (e.code === '23505') throw new ConflictException('...'); }
    const equipo = this.equipoRepository.create(createEquipoDto);
    return this.equipoRepository.save(equipo);
  }

  async findAll(query: ListEquipoQueryDto) {
  const {
    page = 1,
    limit = 10,
    search,
    regionId,
    includeDeleted = 'false',
    sortBy = 'id',
    order = 'ASC',
  } = query;

  const validSortFields = ['id', 'team_name', 'acronym', 'location', 'founded_year'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'id';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const qb = this.equipoRepository
    .createQueryBuilder('equipo')
    .leftJoinAndSelect('equipo.region', 'region');

  if (includeDeleted !== 'true') {
    qb.andWhere('equipo.eliminated IS NULL');
  }

  if (search) {
    qb.andWhere(
      '(equipo.team_name ILIKE :s OR equipo.acronym ILIKE :s OR equipo.location ILIKE :s)',
      { s: `%${search}%` },
    );
  }

  if (regionId && !isNaN(Number(regionId))) {
    qb.andWhere('equipo."Region_id" = :regionId', { regionId: Number(regionId) });
  }

  qb.orderBy(`equipo.${sortField}`, sortOrder);

  const currentPage = Math.max(1, page);
  const take = Math.max(1, limit);
  const skip = (currentPage - 1) * take;

  qb.skip(skip).take(take);

  const [data, total] = await qb.getManyAndCount();

  const lastPage = Math.ceil(total / take);

  return {
    data,
    meta: {
      total,
      page: currentPage,
      limit: take,
      lastPage,
      hasNextPage: currentPage < lastPage,
      hasPrevPage: currentPage > 1,
    },
  };
}


  async findOne(id: number): Promise<Equipo> {
    const equipo = await this.equipoRepository.findOne({
      where: { id, eliminated: IsNull() as any },
      relations: ['region'],
    });
    if (!equipo) throw new NotFoundException('Equipo no encontrado o eliminado');
    return equipo;
  }

  async update(id: number, updateDto: UpdateEquipoDto): Promise<Equipo> {
    const equipo = await this.findOne(id);

    if (updateDto.Region_id) {
      await this.ensureActiveRegion(updateDto.Region_id);
    }

    Object.assign(equipo, updateDto);
    return this.equipoRepository.save(equipo);
  }

  /** Soft delete */
  async remove(id: number): Promise<void> {
    // Usamos soft delete nativo; opcionalmente puedes mantener tu enfoque manual
    const result = await this.equipoRepository.softDelete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('Equipo no encontrado');
    }
  }

  async reactivate(id: number): Promise<Equipo> {
    // restauramos incluso si la región está eliminada -> validamos
    const equipo = await this.equipoRepository.findOne({ where: { id } });
    if (!equipo) throw new NotFoundException('Equipo no encontrado');

    // Asegurar región activa antes de reactivar
    await this.ensureActiveRegion(equipo.Region_id);

    await this.equipoRepository.restore({ id });
    return this.findOne(id);
  }

  /** Listar solo eliminados */
  async findDeleted(query: Omit<ListEquipoQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, regionId, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.equipoRepository
      .createQueryBuilder('equipo')
      .leftJoinAndSelect('equipo.region', 'region')
      .where('equipo.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere(
        '(equipo.team_name ILIKE :s OR equipo.acronym ILIKE :s OR equipo.location ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (regionId) {
      qb.andWhere('equipo."Region_id" = :regionId', { regionId: Number(regionId) });
    }

    qb.orderBy(`equipo.${sortBy}`, order as 'ASC' | 'DESC');

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

  /** Hard delete definitivo */
  async hardDelete(id: number): Promise<void> {
    const result = await this.equipoRepository.delete({ id });
    if (result.affected === 0) throw new NotFoundException('Equipo no encontrado');
  }

  /** Cambiar de región */
  async changeRegion(id: number, regionId: number): Promise<Equipo> {
    const equipo = await this.findOne(id);
    await this.ensureActiveRegion(regionId);
    equipo.Region_id = regionId;
    return this.equipoRepository.save(equipo);
  }
}
