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
  // PR 8 (Contact directory integration): optional now — required only when
  // supplierContactId isn't provided (enforced in the service, since
  // SupplierContract.supplierName stays NOT NULL and either source must
  // supply it). @MinLength(1) still applies whenever a value is sent.
  @IsString()
  @MinLength(1)
  @IsOptional()
  supplierName?: string;

  @IsString()
  @MinLength(1)
  contractName: string;

  // Source of truth for the relation once set — see
  // SupplierContractsService for the dual-write rule with the legacy
  // supplierName/contactPerson/phone/email/address fields above/below. Not
  // @IsUUID(): no DTO in this repo validates ids as UUIDs specifically,
  // only as non-empty strings (matches CreateMaintenanceTicketDto's
  // assignedContactId convention).
  @IsString()
  @IsOptional()
  supplierContactId?: string | null;

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
