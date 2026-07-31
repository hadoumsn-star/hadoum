import { SpaceCondition, SpaceType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSpaceDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(SpaceType)
  type: SpaceType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  building?: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsString()
  @IsOptional()
  zone?: string;

  @IsEnum(SpaceCondition)
  @IsOptional()
  condition?: SpaceCondition;

  @IsInt()
  @IsOptional()
  capacity?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipment?: string[];

  @IsString()
  @IsOptional()
  observations?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
