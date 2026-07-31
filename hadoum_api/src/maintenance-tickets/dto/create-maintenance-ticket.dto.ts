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

  @IsDateString()
  @IsOptional()
  plannedDate?: string;

  @IsInt()
  @IsOptional()
  estimatedCost?: number;
}
