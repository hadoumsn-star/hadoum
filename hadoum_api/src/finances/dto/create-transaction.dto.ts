import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
  PaymentMethod,
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

  // DEPENSE only — see FinancesService for why RECETTE deterministically
  // rejects this rather than silently ignoring it. Not @IsUUID(): matches
  // every other id field in this repo (Contact.categoryId, MaintenanceTicket
  // .assignedContactId), validated only as a non-empty string.
  @IsString()
  @IsOptional()
  supplierContactId?: string | null;

  // Kept optional for both transaction types in this transitional PR — see
  // FinancesService for the reasoning (enforcing "required for DEPENSE"
  // would need either app-level cross-field validation here or a DB check
  // constraint; deferred rather than risk blocking legitimate expense
  // creation before the product decision is confirmed).
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;
}
