import { PartialType } from '@nestjs/mapped-types';
import { CreateManagerDto } from './create-manager.dto';
import { IsOptional, IsDateString, IsEmail, MinLength, IsNotEmpty } from 'class-validator';

export class UpdateManagerDto extends PartialType(CreateManagerDto) {
  @IsOptional()
  @IsDateString()
  eliminated?: string | null;

  // Si quieres permitir cambio de password en este DTO:
  @IsOptional()
  @IsNotEmpty()
  @MinLength(6)
  password?: string;
}

