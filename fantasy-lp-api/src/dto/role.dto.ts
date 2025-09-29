import { IsIn, IsOptional, IsString } from 'class-validator';

export class RoleDto {
  @IsIn(['TOP','JUNGLE','MID','ADC','SUPPORT'])
  code: 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT';

  @IsOptional()
  @IsString()
  name?: string;
}