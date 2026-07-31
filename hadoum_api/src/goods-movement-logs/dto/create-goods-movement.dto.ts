import { GoodsMovementType, StockUnit } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateGoodsMovementDto {
  @IsEnum(GoodsMovementType)
  movementType: GoodsMovementType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  itemReference?: string;

  @IsString()
  @IsOptional()
  stockItemId?: string;

  @IsString()
  @IsOptional()
  inventoryAssetId?: string;

  @IsPositive()
  @IsOptional()
  quantity?: number;

  @IsEnum(StockUnit)
  @IsOptional()
  unit?: StockUnit;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  destination?: string;

  @IsString()
  @IsOptional()
  personInCharge?: string;

  @IsString()
  @IsOptional()
  vehicleRegistration?: string;

  @IsString()
  @IsOptional()
  deliveryNoteNumber?: string;

  @IsString()
  @IsOptional()
  authorizationReference?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsDateString()
  @IsOptional()
  movementDateTime?: string;

  @IsDateString()
  @IsOptional()
  expectedReturnDate?: string;

  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
