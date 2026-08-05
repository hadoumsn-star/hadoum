import { TicketUrgency } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateMaintenanceTicketDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  spaceId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  problemType?: string;

  @IsEnum(TicketUrgency)
  urgency: TicketUrgency;

  @IsString()
  reportedBy: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  // Source of truth for the relation once set — see
  // MaintenanceTicketsService for the dual-write rule with assignedTo above.
  // Not @IsUUID(): no DTO in this repo validates ids as UUIDs specifically
  // (matches CreateContactDto.categoryId's convention), only as non-empty
  // strings.
  @IsString()
  @IsOptional()
  assignedContactId?: string | null;

  @IsDateString()
  @IsOptional()
  plannedDate?: string;

  @IsInt()
  @IsOptional()
  estimatedCost?: number;
}
