import { PartialType } from '@nestjs/mapped-types';
import { CreateManagerDto } from './create-manager.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateManagerDto extends PartialType(CreateManagerDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null; // Usamos string para fecha ISO o null
}
