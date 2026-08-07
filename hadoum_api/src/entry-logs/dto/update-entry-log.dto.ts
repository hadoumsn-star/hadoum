import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateEntryLogDto } from './create-entry-log.dto';

export class UpdateEntryLogDto extends PartialType(CreateEntryLogDto) {
  // Only settable here to correct an already-recorded checkout (routed
  // through validation as MANUAL_CHECKOUT_OVERRIDE) — normal checkout goes
  // through PATCH /entry-logs/:id/check-out instead.
  @IsDateString()
  @IsOptional()
  actualDepartureDateTime?: string;
}
