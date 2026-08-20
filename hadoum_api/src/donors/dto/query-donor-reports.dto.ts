import { Type } from 'class-transformer';
import { DonorReportPeriodType, DonorReportStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryDonorReportsDto {
  @IsOptional()
  @IsString()
  donorProfileId?: string;

  @IsOptional()
  @IsEnum(DonorReportStatus)
  status?: DonorReportStatus;

  @IsOptional()
  @IsEnum(DonorReportPeriodType)
  periodType?: DonorReportPeriodType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
