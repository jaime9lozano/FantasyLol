import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateRegionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string; // Se normaliza con trim en el servicio
}

