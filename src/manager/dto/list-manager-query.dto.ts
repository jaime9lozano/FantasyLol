import {
  IsOptional,
  IsInt,
  Min,
  IsString,
  IsIn,
  IsBooleanString,
} from 'class-validator';

export class ListManagerQueryDto {
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
  search?: string; // busca en username/email

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string; // 'true' | 'false'

  @IsOptional()
  @IsIn(['id', 'username', 'email', 'created_at'])
  sortBy?: string = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}
