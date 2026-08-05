import { ProcedurePriority, ProcedureStatus, ProcedureType } from '@prisma/client';
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

  // Operational tracking status at creation time — restricted server-side
  // (see AdministrativeProceduresService.assertManualStatus) to the same
  // pre-submission subset accepted on update (A_PREPARER / EN_COURS /
  // EN_ATTENTE_REPONSE). Defaults to A_PREPARER via the schema when omitted.
  // Every other status stays reachable only through the validation
  // workflow — untouched by this field.
  @IsEnum(ProcedureStatus)
  @IsOptional()
  status?: ProcedureStatus;

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

  // Source of truth for the relation once set — see
  // AdministrativeProceduresService for the dual-write rule with assignedTo
  // above. Not @IsUUID(): no DTO in this repo validates ids as UUIDs
  // specifically, only as non-empty strings (matches
  // CreateMaintenanceTicketDto's assignedContactId convention).
  @IsString()
  @IsOptional()
  assignedContactId?: string | null;

  @IsString()
  @IsOptional()
  notes?: string;

  // Free text ("Mairie", "Préfecture", "CAF", "Tribunal", …) — only
  // meaningful once status = EN_ATTENTE_REPONSE, but not enforced here
  // (the frontend only shows/requires it in that case); the field itself
  // stays optional so it can never block an unrelated update. Nullable
  // (like assignedContactId above) so UpdateAdministrativeProcedureDto's
  // redeclaration for "explicit clear" stays assignable to
  // Partial<CreateAdministrativeProcedureDto>.
  @IsString()
  @IsOptional()
  pendingResponseOrganization?: string | null;
}
