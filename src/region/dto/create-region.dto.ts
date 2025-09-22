import { IsString, IsNotEmpty } from 'class-validator';

export class CreateRegionDto {
    @IsString()
    @IsNotEmpty()
  name: string;
}
