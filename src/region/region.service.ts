import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
  ) {}

  create(createRegionDto: CreateRegionDto): Promise<Region> {
    const region = this.regionRepository.create(createRegionDto);
    return this.regionRepository.save(region);
  }

  findAll(): Promise<Region[]> {
    return this.regionRepository.find({
      where: { eliminated: IsNull() },
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Region> {
    const region = await this.regionRepository.findOne({
      where: { id, eliminated: IsNull() },
    });
    if (!region) throw new NotFoundException('Region not found or eliminated');
    return region;
  }

  async update(id: number, updateRegionDto: UpdateRegionDto): Promise<Region> {
    const region = await this.findOne(id);

    Object.assign(region, updateRegionDto);
    return this.regionRepository.save(region);
  }

  async remove(id: number): Promise<void> {
    const region = await this.findOne(id);
    region.eliminated = new Date();
    await this.regionRepository.save(region);
  }

  async reactivate(id: number): Promise<Region> {
    const region = await this.regionRepository.findOne({ where: { id } });
    if (!region) throw new NotFoundException('Region not found');

    region.eliminated = null;
    return this.regionRepository.save(region);
  }
}
