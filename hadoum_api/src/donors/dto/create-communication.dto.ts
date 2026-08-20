import {
  DonorCommunicationDirection,
  DonorCommunicationType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// `donorReportId` is deliberately absent — it's only ever set internally by
// DonorReportsService.markSent (see DonorCommunication's own schema
// comment), never client-supplied, so a caller can't forge a link to a
// report it didn't actually send.
export class CreateCommunicationDto {
  @IsString()
  @MinLength(1)
  donorProfileId: string;

  @IsEnum(DonorCommunicationType)
  type: DonorCommunicationType;

  @IsEnum(DonorCommunicationDirection)
  @IsOptional()
  direction?: DonorCommunicationDirection;

  @IsDateString()
  date: string;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @IsOptional()
  content?: string;
}
