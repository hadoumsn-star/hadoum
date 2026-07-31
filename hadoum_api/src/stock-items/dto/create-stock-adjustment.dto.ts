import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateStockAdjustmentDto {
  // Signed: positive to add, negative to remove.
  @IsNumber()
  quantityDelta: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  // When set, records the adjustment as a loss (PERTE/CASSE/PEREMPTION)
  // instead of a generic AJUSTEMENT_NEGATIF, and is always sensitive.
  @IsIn(['PERTE', 'CASSE', 'PEREMPTION'])
  @IsOptional()
  lossType?: 'PERTE' | 'CASSE' | 'PEREMPTION';

  // Marks the movement as a physical-inventory reconciliation
  // (INVENTAIRE_CORRECTION) rather than a routine adjustment.
  @IsBoolean()
  @IsOptional()
  isInventoryCorrection?: boolean;

  @IsDateString()
  @IsOptional()
  movementDate?: string;
}
