import { IsOptional, IsInt, Min, IsString, IsIn, IsBooleanString, IsNumberString } from 'class-validator';

export class ListEquipoQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  regionId?: string; // usar string para permitir bigints largos

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string; // 'true' | 'false'

  @IsOptional()
  @IsIn(['id', 'team_name', 'acronym', 'location', 'founded_year'])
  sortBy?: string = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}
