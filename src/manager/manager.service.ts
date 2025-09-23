import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, FindOptionsWhere } from 'typeorm';
import { Manager } from './entities/manager.entity';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { ListManagerQueryDto } from './dto/list-manager-query.dto';
import { LoginManagerDto } from './dto/login-manager.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class ManagerService {
  private readonly saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

  constructor(
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async ensureUniqueUsernameEmail(
  username?: string,
  email?: string,
  excludeId?: number,
) {
  const where: FindOptionsWhere<Manager>[] = [];

  if (username) {
    where.push({ username });
  }
  if (email) {
    where.push({ email: this.normalizeEmail(email) });
  }
  if (where.length === 0) return;

  const whereWithExclude: FindOptionsWhere<Manager>[] = excludeId
    ? where.map((cond) => ({ ...cond, id: Not(excludeId) }))
    : where;

  const existing = await this.managerRepository.findOne({
    where: whereWithExclude,
    withDeleted: true, // incluye soft-deleted para detectar duplicados
  });

  if (existing) throw new ConflictException('Username o email ya existe');
}


  async create(dto: CreateManagerDto): Promise<Manager> {
    const email = this.normalizeEmail(dto.email);
    await this.ensureUniqueUsernameEmail(dto.username, email);

    const password_hash = await bcrypt.hash(dto.password, this.saltRounds);
    const manager = this.managerRepository.create({
      username: dto.username,
      email,
      password_hash,
    });

    const saved = await this.managerRepository.save(manager);
    // password_hash no viene por select:false, así que safe
    return saved;
  }

  async findAll(query: ListManagerQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      includeDeleted = 'false',
      sortBy = 'id',
      order = 'ASC',
    } = query;

    const qb = this.managerRepository.createQueryBuilder('manager');

    if (includeDeleted !== 'true') {
      qb.andWhere('manager.eliminated IS NULL');
    }

    if (search) {
      qb.andWhere(
        '(manager.username ILIKE :s OR manager.email ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    qb.orderBy(`manager.${sortBy}`, order as 'ASC' | 'DESC');

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

  async findDeleted(query: Omit<ListManagerQueryDto, 'includeDeleted'>) {
    const { page = 1, limit = 10, search, sortBy = 'id', order = 'ASC' } = query;

    const qb = this.managerRepository
      .createQueryBuilder('manager')
      .where('manager.eliminated IS NOT NULL');

    if (search) {
      qb.andWhere(
        '(manager.username ILIKE :s OR manager.email ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    qb.orderBy(`manager.${sortBy}`, order as 'ASC' | 'DESC');

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

  async findOne(id: number): Promise<Manager> {
    const manager = await this.managerRepository.findOne({
      where: { id, eliminated: IsNull() as any },
    });
    if (!manager) throw new NotFoundException('Manager no encontrado o eliminado');
    return manager;
  }

  async findByEmail(email: string): Promise<Manager | null> {
    return this.managerRepository.findOne({
      where: { email: this.normalizeEmail(email), eliminated: IsNull() as any },
    });
  }

  async update(id: number, dto: UpdateManagerDto): Promise<Manager> {
    const manager = await this.findOne(id);

    // Normalizar y asegurar unicidad si cambian username/email
    const newEmail = dto.email ? this.normalizeEmail(dto.email) : undefined;
    await this.ensureUniqueUsernameEmail(dto.username, newEmail, id);

    if (dto.password) {
      const hashed = await bcrypt.hash(dto.password, this.saltRounds);
      manager.password_hash = hashed;
      delete dto.password;
    }

    if (newEmail) dto.email = newEmail;

    Object.assign(manager, dto);
    return this.managerRepository.save(manager);
  }

  /** Soft delete */
  async remove(id: number): Promise<void> {
    const res = await this.managerRepository.softDelete({ id });
    if (res.affected === 0) throw new NotFoundException('Manager no encontrado');
  }

  async reactivate(id: number): Promise<Manager> {
    const exists = await this.managerRepository.findOne({ where: { id }, withDeleted: true });
    if (!exists) throw new NotFoundException('Manager no encontrado');

    await this.managerRepository.restore({ id });
    return this.findOne(id);
  }

  /** Hard delete definitivo */
  async hardDelete(id: number): Promise<void> {
    const res = await this.managerRepository.delete({ id });
    if (res.affected === 0) throw new NotFoundException('Manager no encontrado');
  }

  /** Login básico sin JWT (para pruebas) */
  async login(dto: LoginManagerDto) {
    const email = this.normalizeEmail(dto.email);

    // Necesitamos seleccionar password_hash explícitamente
    const manager = await this.managerRepository
      .createQueryBuilder('manager')
      .where('manager.email = :email', { email })
      .andWhere('manager.eliminated IS NULL')
      .addSelect('manager.password_hash')
      .getOne();

    if (!manager) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(dto.password, manager.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    // Respuesta básica de login para pruebas (sin token)
    // Si luego metes JWT, aquí devolverías accessToken/refreshToken
    return {
      message: 'Login correcto',
      user: {
        id: manager.id,
        username: manager.username,
        email: manager.email,
      },
    };
  }

  /** Cambio de contraseña seguro (requiere oldPassword) */
  async changePassword(id: number, dto: ChangePasswordDto) {
    // seleccionar hash
    const manager = await this.managerRepository
      .createQueryBuilder('manager')
      .where('manager.id = :id', { id })
      .andWhere('manager.eliminated IS NULL')
      .addSelect('manager.password_hash')
      .getOne();

    if (!manager) throw new NotFoundException('Manager no encontrado');

    const ok = await bcrypt.compare(dto.oldPassword, manager.password_hash);
    if (!ok) throw new BadRequestException('La contraseña actual no es correcta');

    const newHash = await bcrypt.hash(dto.newPassword, this.saltRounds);
    await this.managerRepository.update({ id }, { password_hash: newHash });

    return { message: 'Contraseña actualizada correctamente' };
  }
}


