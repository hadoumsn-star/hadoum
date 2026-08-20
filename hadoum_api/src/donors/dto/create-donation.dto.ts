import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDonationDto {
  @IsString()
  @MinLength(1)
  donorProfileId: string;

  @IsString()
  @IsOptional()
  campaignId?: string;

  // Whole XOF, never a float — same convention as Transaction.amountXof.
  // @Min(1): rejects both zero and negative donations.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountXof: number;

  @IsDateString()
  date: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Optional, client-supplied — the frontend is expected to generate one
  // UUID per "record this donation" user action and resend the same value
  // on any retry (double click, network retry, ...). See
  // DonationsService.create for how this makes a repeated request safe.
  // Omitted entirely, this call has no replay protection beyond
  // Donation.transactionId's own uniqueness.
  @IsString()
  @IsOptional()
  @MaxLength(100)
  idempotencyKey?: string;
}
