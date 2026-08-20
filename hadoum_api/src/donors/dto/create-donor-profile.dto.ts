import { DonorType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDonorProfileDto {
  // The Contact must already exist — DonorsService never creates a Contact
  // itself (see ContactsService.findOne, reused as-is). The frontend is
  // expected to use the existing ContactAutocomplete/ContactFormModal
  // search-or-create flow first, then pass the resulting id here.
  @IsString()
  @MinLength(1)
  contactId: string;

  @IsEnum(DonorType)
  type: DonorType;

  @IsString()
  @IsOptional()
  country?: string;

  // PARRAIN-only in practice — a DONATEUR_PONCTUEL that sends these anyway
  // has them silently cleared by DonorsService, never rejected. See
  // DonorsService.resolveRecurringFields.
  @IsDateString()
  @IsOptional()
  engagementStartDate?: string;

  // Whole XOF, never a float — same convention as
  // Transaction.amountXof/FundRequest.amountXof.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  monthlyContributionXof?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
