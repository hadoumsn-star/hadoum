// Module 6 (PR 21) — server-side port of the frontend's single source of
// truth for child present/absent classification
// (hadoum_frontend/src/app/utils/childAttendance.ts). This file must stay
// in lockstep with that one: the same three functions, the same state
// machine, ported field-for-field from the frontend's `Child` view-model
// shape to the backend's real Prisma `Child` columns. See
// child-attendance.util.spec.ts for the parity tests that pin this down.
//
// Two frontend concepts intentionally do NOT appear here, because they are
// not real backend rules — they are frontend-only artifacts:
//   - `attendanceStatus` is not a Prisma field at all. It is a hardcoded
//     literal `'present'` set unconditionally by children.mapper.ts's
//     mapSummaryToChild(). getChildEffectiveAttendance's fallback branch
//     ("otherwise present") is therefore simply `'present'` here — this is
//     not a rule change, it's removing a constant that never varied.
//   - `exitStatus` ('actif' | 'sorti') is derived on the frontend as
//     `isActive === false ? 'sorti' : 'actif'`. The backend port uses the
//     real `isActive` boolean directly instead of re-deriving that
//     intermediate string.
//
// Timezone: the frontend's `daysFromToday` compares two `Date` objects at
// LOCAL midnight. This port compares at UTC midnight instead — deliberately
// NOT a new assumption: date-only ISO strings (e.g. "2026-08-19") are
// parsed as UTC midnight by the JS `Date` constructor on both frontend and
// backend, and Hadoum's real deployment is in Senegal (WAT, UTC+0, no DST),
// so local time and UTC time are identical in practice. Using UTC here also
// matches this module's own dashboard-period.util.ts convention, so a "day"
// boundary can never drift between the two.

export type ChildSortieState = 'none' | 'pending' | 'active' | 'returned';

// The minimal, non-PII slice of the real Child model this rule needs.
// Callers must select exactly these fields — never firstName/lastName/
// guardianName/medical or any other identifying column — when fetching
// children for attendance aggregation.
export interface ChildAttendanceInput {
  isActive: boolean;
  exitType: string | null;
  exitDate: Date | null;
  exitReturnDate: Date | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Whole-day difference between `date` and `now`, both compared at UTC midnight. */
function daysFromToday(date: Date, now: Date): number {
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dateUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.round((dateUtc - todayUtc) / ONE_DAY_MS);
}

/** Direct port of childAttendance.ts's getChildSortieState. */
export function getChildSortieState(
  c: ChildAttendanceInput,
  now: Date = new Date(),
): ChildSortieState {
  if (c.exitType !== 'temporaire' || !c.exitDate) return 'none';
  const daysUntilDeparture = daysFromToday(c.exitDate, now);
  if (daysUntilDeparture > 0) return 'pending';
  if (c.exitReturnDate && daysFromToday(c.exitReturnDate, now) <= 0) {
    return 'returned';
  }
  return 'active';
}

/**
 * Direct port of childAttendance.ts's isChildEffectivelyActive, with the
 * frontend's `manuallySorti` parameter fixed to its default derivation
 * (`exitStatus === 'sorti'`, i.e. `isActive === false`) — the dashboard has
 * no local optimistic-update state to override it with, same as the
 * frontend doc comment already notes for any caller without one.
 */
export function isChildEffectivelyActive(
  c: ChildAttendanceInput,
  now: Date = new Date(),
): boolean {
  if (c.isActive) return true;
  const state = getChildSortieState(c, now);
  return state === 'active' || state === 'returned' || state === 'pending';
}

/** Direct port of childAttendance.ts's getChildEffectiveAttendance. */
export function getChildEffectiveAttendance(
  c: ChildAttendanceInput,
  now: Date = new Date(),
): 'present' | 'absent' {
  const state = getChildSortieState(c, now);
  if (state === 'active' || state === 'returned') return 'absent';
  return 'present';
}

export interface ChildAttendanceSummary {
  present: number;
  absent: number;
}

/**
 * Direct port of childAttendance.ts's summarizeChildAttendance: every
 * effectively-active child is counted as exactly one of present/absent;
 * children who are not effectively active (permanently exited, or
 * inactive with no tracked temporary sortie) are excluded entirely.
 *
 * Note for callers: `present + absent` here does NOT necessarily equal a
 * plain `count(isActive: true)` — the effectively-active population also
 * includes `isActive: false` children who are on a still-tracked temporary
 * sortie (pending/active/returned). This mirrors the frontend rule exactly
 * and is documented, not accidental — see DashboardService.getOverview's
 * own comment at the call site.
 */
export function summarizeChildAttendance(
  children: ChildAttendanceInput[],
  now: Date = new Date(),
): ChildAttendanceSummary {
  let present = 0;
  let absent = 0;
  for (const c of children) {
    if (!isChildEffectivelyActive(c, now)) continue;
    if (getChildEffectiveAttendance(c, now) === 'present') present++;
    else absent++;
  }
  return { present, absent };
}
