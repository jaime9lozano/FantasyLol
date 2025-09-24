import { IsOptional, IsInt, Min, IsString, IsIn, IsBooleanString } from 'class-validator';

export class ListEsportsLeagueQueryDto {
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
  @IsBooleanString()
  includeDeleted?: string;

  @IsOptional()
  @IsIn(['id', 'slug', 'name'])
  sortBy?: string = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}