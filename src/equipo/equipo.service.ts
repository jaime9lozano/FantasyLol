import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Equipo } from './entities/equipo.entity';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';

@Injectable()
export class EquipoService {
  constructor(
    @InjectRepository(Equipo)
    private equipoRepository: Repository<Equipo>,
  ) {}

  create(createEquipoDto: CreateEquipoDto): Promise<Equipo> {
    const equipo = this.equipoRepository.create(createEquipoDto);
    return this.equipoRepository.save(equipo);
  }

  findAll(): Promise<Equipo[]> {
    return this.equipoRepository.find({
      where: { eliminated: IsNull() },
      order: { id: 'ASC' },
      relations: ['region'],
    });
  }

  async findOne(id: number): Promise<Equipo> {
    const equipo = await this.equipoRepository.findOne({
      where: { id, eliminated: IsNull() },
      relations: ['region'],
    });
    if (!equipo) throw new NotFoundException('Equipo not found or eliminated');
    return equipo;
  }

  async update(id: number, updateEquipoDto: UpdateEquipoDto): Promise<Equipo> {
    const equipo = await this.findOne(id);
    Object.assign(equipo, updateEquipoDto);
    return this.equipoRepository.save(equipo);
  }

  async remove(id: number): Promise<void> {
    const equipo = await this.findOne(id);
    equipo.eliminated = new Date();
    await this.equipoRepository.save(equipo);
  }

  async reactivate(id: number): Promise<Equipo> {
    const equipo = await this.equipoRepository.findOne({ where: { id } });
    if (!equipo) throw new NotFoundException('Equipo not found');
    equipo.eliminated = null;
    return this.equipoRepository.save(equipo);
  }
}
