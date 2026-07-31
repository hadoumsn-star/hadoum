import {
  BillingFrequency,
  ContractCategory,
  RenewalType,
} from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSupplierContractDto {
  @IsString()
  @MinLength(1)
  supplierName: string;

  @IsString()
  @MinLength(1)
  contractName: string;

  @IsEnum(ContractCategory)
  category: ContractCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  contractNumber?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsDateString()
  @IsOptional()
  renewalDate?: string;

  @IsEnum(RenewalType)
  @IsOptional()
  renewalType?: RenewalType;

  @IsInt()
  @IsOptional()
  noticePeriod?: number;

  @IsInt()
  @IsOptional()
  amount?: number;

  @IsEnum(BillingFrequency)
  @IsOptional()
  billingFrequency?: BillingFrequency;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
