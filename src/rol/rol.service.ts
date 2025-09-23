import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Rol } from './entities/rol.entity';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { ListRolQueryDto } from './dto/list-rol-query.dto';

@Injectable()
export class RolService {
  constructor(
    @InjectRepository(Rol)
    private readonly rolRepository: Repository<Rol>,
  ) {}

  async create(createRolDto: CreateRolDto): Promise<Rol> {
    // Controlar duplicados por unique constraint
    try {
      const rol = this.rolRepository.create(createRolDto);
      return await this.rolRepository.save(rol);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('El rol ya existe');
      }
      throw e;
    }
  }

  async findAll(query: ListRolQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const validSortFields = ['id', 'rol'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'id';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const qb = this.rolRepository.createQueryBuilder('rol');

    if (includeDeleted !== 'true') {
      qb.andWhere('rol.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere('rol.rol ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`rol.${sortField}`, sortOrder);

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

  async findOne(id: number): Promise<Rol> {
    const rol = await this.rolRepository.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado o eliminado');
    return rol;
  }

  async update(id: number, updateDto: UpdateRolDto): Promise<Rol> {
    const rol = await this.findOne(id);

    Object.assign(rol, updateDto);
    try {
      return await this.rolRepository.save(rol);
    } catch (e) {
      if (e.code === '23505') {
        throw new ConflictException('El rol ya existe');
      }
      throw e;
    }
  }

  /** Soft delete */
  async remove(id: number): Promise<void> {
    const result = await this.rolRepository.softDelete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('Rol no encontrado');
    }
  }

  async reactivate(id: number): Promise<Rol> {
    const rol = await this.rolRepository.findOne({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    await this.rolRepository.restore({ id });
    return this.findOne(id);
  }

  /** Listar solo eliminados */
  async findDeleted(query: Omit<ListRolQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.rolRepository
      .createQueryBuilder('rol')
      .where('rol.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere('rol.rol ILIKE :s', { s: `%${search}%` });
    }

    qb.orderBy(`rol.${sortBy}`, order as 'ASC' | 'DESC');

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
    const result = await this.rolRepository.delete({ id });
    if (result.affected === 0) throw new NotFoundException('Rol no encontrado');
  }
}


