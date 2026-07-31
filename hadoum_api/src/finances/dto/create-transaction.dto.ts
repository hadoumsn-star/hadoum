import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsEnum(TransactionCategory)
  category: TransactionCategory;

  @IsString()
  label: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountXof: number;

  @IsDateString()
  date: string;

  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @IsString()
  @IsOptional()
  donorName?: string;

  @IsBoolean()
  @IsOptional()
  isAnonymousDonor?: boolean;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
