import { IncidentPriority, IncidentType } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  @MinLength(1)
  title: string;

  // "Category" in the product language — see the IncidentType enum comment.
  @IsEnum(IncidentType)
  type: IncidentType;

  // PR 11: description is now mandatory for every new incident.
  @IsString()
  @MinLength(1)
  description: string;

  @IsString()
  signaledBy: string;

  @IsEnum(IncidentPriority)
  priority: IncidentPriority;

  @IsDateString()
  @IsOptional()
  date?: string;

  // "Persons concerned" — real Child/StaffMember ids, never free text.
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  childIds?: string[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  staffIds?: string[];

  // "Spaces concerned" — real Space ids from the existing "Locaux et
  // espaces" module, never free text (same pattern as childIds/staffIds).
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  spaceIds?: string[];
}
