import { ProcedurePriority, ProcedureType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAdministrativeProcedureDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsEnum(ProcedureType)
  procedureType: ProcedureType;

  @IsString()
  @MinLength(1)
  authority: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsDateString()
  @IsOptional()
  submissionDate?: string;

  @IsDateString()
  @IsOptional()
  expectedResponseDate?: string;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;

  @IsDateString()
  @IsOptional()
  renewalDate?: string;

  @IsEnum(ProcedurePriority)
  @IsOptional()
  priority?: ProcedurePriority;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
