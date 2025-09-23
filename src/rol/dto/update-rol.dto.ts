import { PartialType } from '@nestjs/mapped-types';
import { CreateRolDto } from './create-rol.dto';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateRolDto extends PartialType(CreateRolDto) 
{
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;
}


