import { StockCategory, StockUnit } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStockItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsEnum(StockCategory)
  category: StockCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(StockUnit)
  @IsOptional()
  unit?: StockUnit;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maximumQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderQuantity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  unitCost?: number;

  @IsString()
  @IsOptional()
  storageLocation?: string;

  @IsString()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsString()
  @IsOptional()
  supplierContractId?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;

  @IsBoolean()
  @IsOptional()
  isPerishable?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  // Optional opening balance — still recorded as an immutable ENTREE movement,
  // never written straight to currentQuantity.
  @IsNumber()
  @IsPositive()
  @IsOptional()
  initialQuantity?: number;
}
