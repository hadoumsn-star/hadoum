import { EntryType, VisitorCategory } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEntryLogDto {
  @IsEnum(EntryType)
  entryType: EntryType;

  @IsEnum(VisitorCategory)
  visitorCategory: VisitorCategory;

  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @IsOptional()
  organization?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  identityDocumentType?: string;

  @IsString()
  @IsOptional()
  identityDocumentNumber?: string;

  @IsString()
  @MinLength(1)
  purpose: string;

  @IsString()
  @IsOptional()
  personVisited?: string;

  @IsString()
  @IsOptional()
  personVisitedUserId?: string;

  @IsString()
  @IsOptional()
  spaceId?: string;

  @IsDateString()
  @IsOptional()
  arrivalDateTime?: string;

  @IsDateString()
  @IsOptional()
  expectedDepartureDateTime?: string;

  @IsString()
  @IsOptional()
  accessBadgeNumber?: string;

  @IsString()
  @IsOptional()
  vehicleRegistration?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  accompanyingPersonsCount?: number;

  @IsString()
  @IsOptional()
  authorizedBy?: string;

  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
