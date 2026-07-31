import { AssetCondition, StockCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInventoryAssetDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  assetCode?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsEnum(StockCategory)
  category: StockCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsDateString()
  @IsOptional()
  acquisitionDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  acquisitionCost?: number;

  @IsString()
  @IsOptional()
  fundingSource?: string;

  @IsString()
  @IsOptional()
  donorName?: string;

  @IsDateString()
  @IsOptional()
  warrantyEndDate?: string;

  @IsEnum(AssetCondition)
  @IsOptional()
  condition?: AssetCondition;

  @IsString()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @IsDateString()
  @IsOptional()
  lastInventoryDate?: string;

  @IsDateString()
  @IsOptional()
  nextInventoryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
