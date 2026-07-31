import { PartialType } from '@nestjs/mapped-types';
import { ProcedureStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateAdministrativeProcedureDto } from './create-administrative-procedure.dto';

export class UpdateAdministrativeProcedureDto extends PartialType(
  CreateAdministrativeProcedureDto,
) {
  // Only routine pre-submission transitions (A_PREPARER <-> EN_COURS) are
  // accepted here. Every other transition goes through a validation-gated
  // endpoint (submit-validation / request-renewal / request-archive / approve).
  @IsEnum(ProcedureStatus)
  @IsOptional()
  status?: ProcedureStatus;
}
