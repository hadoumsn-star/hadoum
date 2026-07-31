import {
  IsDateString,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateStockExitDto {
  @IsPositive()
  quantity: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  destination?: string;

  @IsString()
  @IsOptional()
  referenceDocument?: string;

  @IsDateString()
  @IsOptional()
  movementDate?: string;
}
