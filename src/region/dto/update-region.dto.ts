import { PartialType } from '@nestjs/mapped-types';
import { CreateRegionDto } from './create-region.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateRegionDto extends PartialType(CreateRegionDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null; // no se usará para controlar el delete
}


