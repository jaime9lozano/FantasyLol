import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Manager } from './entities/manager.entity';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';

@Injectable()
export class ManagerService {
  constructor(
    @InjectRepository(Manager) private managerRepository: Repository<Manager>,
  ) {}

  async create(createManagerDto: CreateManagerDto): Promise<Manager> {
    const existing = await this.managerRepository.findOne({ where: [{ email: createManagerDto.email }, { username: createManagerDto.username }] });
    if (existing) {
      throw new ConflictException('Username or email already exists');
    }

    const password_hash = await bcrypt.hash(createManagerDto.password, 10);
    const manager = this.managerRepository.create({
      username: createManagerDto.username,
      email: createManagerDto.email,
      password_hash,
    });
    return this.managerRepository.save(manager);
  }

  findAll(): Promise<Manager[]> {
    return this.managerRepository.find();
  }

  async findOne(id: number): Promise<Manager> {
    const manager = await this.managerRepository.findOneBy({ id });
    if (!manager) throw new NotFoundException('Manager not found');
    return manager;
  }

  async update(id: number, updateManagerDto: UpdateManagerDto): Promise<Manager> {
  const manager = await this.findOne(id);

  if (updateManagerDto.password) {
    const hashedPassword = await bcrypt.hash(updateManagerDto.password, 10);
    // Actualiza sólo el campo password_hash directamente en la entidad
    manager.password_hash = hashedPassword;
    delete updateManagerDto.password;
  }

  Object.assign(manager, updateManagerDto);
  return this.managerRepository.save(manager);
}


  async remove(id: number): Promise<void> {
    await this.managerRepository.delete(id);
  }
}

