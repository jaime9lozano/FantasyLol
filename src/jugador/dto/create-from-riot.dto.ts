import { IsString, IsNumber } from 'class-validator';

export class CreateFromRiotDto {
  @IsString()
  summonerName: string;

  @IsNumber()
  teamId: number;

  @IsNumber()
  regionId: number;

  @IsNumber()
  roleId: number;
}
