import { IncidentStatus } from '@prisma/client';
import { IsIn, IsString, MinLength } from 'class-validator';

// PR 11 — the only statuses a status change may target. PLANIFIE and
// EN_RETARD are deliberately excluded: they're legacy values kept in the
// Prisma enum purely so historical incidents keep loading (see schema.prisma),
// never a valid target for a new transition.
export const SELECTABLE_INCIDENT_STATUSES: IncidentStatus[] = [
  'EN_COURS',
  'EN_ATTENTE',
  'RESOLU',
];

export class ChangeIncidentStatusDto {
  @IsIn(SELECTABLE_INCIDENT_STATUSES)
  status: IncidentStatus;

  // PR 11 — a note is mandatory on every status change; it becomes the
  // IncidentStatusHistory row's `note` alongside the previous/new status.
  @IsString()
  @MinLength(1)
  note: string;
}
