import { DonorType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Hand-written rather than `PartialType(CreateDonorProfileDto)` — that
// would also make `contactId` an accepted (optional) field on update, and
// this endpoint deliberately never re-links a DonorProfile to a different
// Contact (PR 16: kept out on purpose — see DonorsService's own comment; a
// mistaken association is handled administratively, not through this DTO).
// Same reasoning as UpdateContactDto excluding `active` (its own dedicated,
// more restrictively-guarded endpoint here too — see deactivate/reactivate).
//
// PR 16: `engagementStartDate`/`monthlyContributionXof` are `| null` on
// purpose — `@IsOptional()` treats *both* an omitted property and an
// explicit `null` as "skip validation", but DonorsService.update needs to
// tell them apart (omitted = keep current value, explicit null = clear
// it). See DonorsService.update's three-way `!== undefined` check, the
// same convention MaintenanceTicket.assignedContactId already uses for a
// nullable FK.
export class UpdateDonorProfileDto {
  @IsEnum(DonorType)
  @IsOptional()
  type?: DonorType;

  @IsString()
  @IsOptional()
  country?: string;

  @IsDateString()
  @IsOptional()
  engagementStartDate?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  monthlyContributionXof?: number | null;

  @IsString()
  @IsOptional()
  notes?: string;
}
