import { PartialType } from '@nestjs/mapped-types';
import { TicketStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { CreateMaintenanceTicketDto } from './create-maintenance-ticket.dto';

export class UpdateMaintenanceTicketDto extends PartialType(
  CreateMaintenanceTicketDto,
) {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @IsInt()
  @IsOptional()
  actualCost?: number;
}
