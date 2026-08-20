import { DonorReportPeriodType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateDonorReportDto {
  @IsString()
  @MinLength(1)
  donorProfileId: string;

  @IsEnum(DonorReportPeriodType)
  periodType: DonorReportPeriodType;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  // Director-provided free text — never auto-generated. See
  // ReportDataService.build's own comment for why. Can also be supplied
  // (or changed) at generate() time; whichever is present when generate()
  // runs is what gets rendered.
  @IsString()
  @IsOptional()
  activitiesNarrative?: string;
}
