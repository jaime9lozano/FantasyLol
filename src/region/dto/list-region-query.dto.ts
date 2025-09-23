import { IsOptional, IsInt, Min, IsString, IsIn, IsBooleanString } from 'class-validator';

export class ListRegionQueryDto {
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
  search?: string; // busca por nombre (ILIKE)

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string; // 'true' | 'false'

  @IsOptional()
  @IsIn(['id', 'name'])
  sortBy?: string = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}
