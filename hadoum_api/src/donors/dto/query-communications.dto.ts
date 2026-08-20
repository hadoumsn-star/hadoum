import { Type } from 'class-transformer';
import {
  DonorCommunicationDirection,
  DonorCommunicationType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryCommunicationsDto {
  @IsOptional()
  @IsString()
  donorProfileId?: string;

  @IsOptional()
  @IsEnum(DonorCommunicationType)
  type?: DonorCommunicationType;

  @IsOptional()
  @IsEnum(DonorCommunicationDirection)
  direction?: DonorCommunicationDirection;

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
