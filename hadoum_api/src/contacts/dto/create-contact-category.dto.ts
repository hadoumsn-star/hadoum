import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateContactCategoryDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
