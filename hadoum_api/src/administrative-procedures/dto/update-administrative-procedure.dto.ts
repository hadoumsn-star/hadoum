import { PartialType } from '@nestjs/mapped-types';
import { ProcedureStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateAdministrativeProcedureDto } from './create-administrative-procedure.dto';

// pendingResponseOrganization needs no redeclaration here (unlike
// assignedContactId's dedicated dual-write DTOs elsewhere): it's already
// `string | null` on CreateAdministrativeProcedureDto, so PartialType
// already gives omitted/untouched (undefined), explicit clear (null), and
// replace (string) for free.
export class UpdateAdministrativeProcedureDto extends PartialType(
  CreateAdministrativeProcedureDto,
) {
  // Only routine, operational-tracking transitions (A_PREPARER / EN_COURS /
  // EN_ATTENTE_REPONSE, in any direction between them) are accepted here.
  // Every other transition goes through a validation-gated endpoint
  // (submit-validation / request-renewal / request-archive / approve).
  @IsEnum(ProcedureStatus)
  @IsOptional()
  status?: ProcedureStatus;
}
