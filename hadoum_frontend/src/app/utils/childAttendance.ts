import type { Child } from '../data/mockData';

// ─── Child attendance — single source of truth ─────────────────────────────
// This is the exact PRESENT/ABSENT computation ChildrenPage has always used
// (previously defined locally there, now extracted here so the Director
// Dashboard's "Présence des enfants" cards can reuse it verbatim instead of
// re-deriving their own version). There is no per-day confirmation step and
// no "Non confirmée" state for children — every child is deterministically
// either 'present' or 'absent':
//   - on an active or not-yet-closed-out temporary sortie → 'absent'
//   - otherwise → the child's own attendanceStatus (currently always
//     'present' — see children.mapper.ts's mapSummaryToChild)
// This intentionally does NOT mirror the staff daily-presence model
// (StaffPresenceConfirmation / listDailyPresence's PRESENT/ABSENT/
// NON_CONFIRMED tri-state) — the child and staff attendance models are
// different, so their logic is kept separate on purpose.

export type ChildSortieState = 'none' | 'pending' | 'active' | 'returned';

export function daysFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function getChildSortieState(c: Child): ChildSortieState {
  if (c.exitType !== 'temporaire' || !c.exitDate) return 'none';
  const daysUntilDep = daysFromToday(c.exitDate);
  if (daysUntilDep > 0) return 'pending';
  if (c.exitReturnDate && daysFromToday(c.exitReturnDate) <= 0) return 'returned';
  return 'active';
}

export function getChildEffectiveAttendance(c: Child): 'present' | 'absent' {
  const state = getChildSortieState(c);
  if (state === 'active' || state === 'returned') return 'absent';
  return c.attendanceStatus;
}

// A child counts as belonging to the institution today if they were never
// marked as exited, OR their exit is a temporary sortie still being tracked
// (pending departure, currently away, or returned but not yet closed out).
// `manuallySorti` lets callers plug in their own "has this child been
// marked as exited" signal — ChildrenPage folds in its own local optimistic
// CRM override on top of the API's exitStatus; callers with no such local
// state (e.g. the Dashboard) can rely on the default, which uses exitStatus
// alone.
export function isChildEffectivelyActive(c: Child, manuallySorti: boolean = c.exitStatus === 'sorti'): boolean {
  if (!manuallySorti) return true;
  const state = getChildSortieState(c);
  return state === 'active' || state === 'returned' || state === 'pending';
}

export interface ChildAttendanceSummary {
  present: number;
  absent: number;
}

// Present/absent counts over every effectively-active child — inactive and
// permanently-exited children are excluded first, then every remaining
// (eligible) child is counted as exactly one of PRESENT or ABSENT, never
// left uncounted.
export function summarizeChildAttendance(children: Child[]): ChildAttendanceSummary {
  let present = 0;
  let absent = 0;
  for (const c of children) {
    if (!isChildEffectivelyActive(c)) continue;
    if (getChildEffectiveAttendance(c) === 'present') present++;
    else absent++;
  }
  return { present, absent };
}
