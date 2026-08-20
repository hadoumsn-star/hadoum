import {
  getChildSortieState,
  isChildEffectivelyActive,
  getChildEffectiveAttendance,
  summarizeChildAttendance,
  ChildAttendanceInput,
} from './child-attendance.util';

// Parity tests against hadoum_frontend/src/app/utils/childAttendance.ts's
// exact behavior (reproduced/verified by hand against that file — see this
// module's own doc comment). NOW is fixed so every "today"-relative
// boundary below is deterministic.
const NOW = new Date('2026-08-19T12:00:00.000Z'); // Wednesday, 19 Aug 2026

function child(overrides: Partial<ChildAttendanceInput>): ChildAttendanceInput {
  return {
    isActive: true,
    exitType: null,
    exitDate: null,
    exitReturnDate: null,
    ...overrides,
  };
}

const iso = (s: string) => new Date(s);

describe('getChildSortieState', () => {
  it('is "none" when exitType is not temporaire', () => {
    expect(
      getChildSortieState(
        child({ exitType: 'définitive', exitDate: iso('2026-08-19') }),
        NOW,
      ),
    ).toBe('none');
    expect(getChildSortieState(child({ exitType: null }), NOW)).toBe('none');
  });

  it('is "none" when temporaire but exitDate is missing', () => {
    expect(
      getChildSortieState(
        child({ exitType: 'temporaire', exitDate: null }),
        NOW,
      ),
    ).toBe('none');
  });

  it('is "pending" when exitDate is strictly in the future', () => {
    expect(
      getChildSortieState(
        child({ exitType: 'temporaire', exitDate: iso('2026-08-20') }),
        NOW,
      ),
    ).toBe('pending');
  });

  it('is "active" when exitDate is today and there is no exitReturnDate', () => {
    expect(
      getChildSortieState(
        child({ exitType: 'temporaire', exitDate: iso('2026-08-19') }),
        NOW,
      ),
    ).toBe('active');
  });

  it('is "active" when exitDate is in the past and exitReturnDate is still in the future', () => {
    expect(
      getChildSortieState(
        child({
          exitType: 'temporaire',
          exitDate: iso('2026-08-10'),
          exitReturnDate: iso('2026-08-25'),
        }),
        NOW,
      ),
    ).toBe('active');
  });

  it('is "returned" when exitReturnDate is today', () => {
    expect(
      getChildSortieState(
        child({
          exitType: 'temporaire',
          exitDate: iso('2026-08-10'),
          exitReturnDate: iso('2026-08-19'),
        }),
        NOW,
      ),
    ).toBe('returned');
  });

  it('is "returned" when exitReturnDate is strictly in the past', () => {
    expect(
      getChildSortieState(
        child({
          exitType: 'temporaire',
          exitDate: iso('2026-08-10'),
          exitReturnDate: iso('2026-08-11'),
        }),
        NOW,
      ),
    ).toBe('returned');
  });

  it('is "active" (not "pending") when exitDate is exactly today', () => {
    // daysUntilDeparture === 0 falls through the `> 0` pending check.
    expect(
      getChildSortieState(
        child({ exitType: 'temporaire', exitDate: iso('2026-08-19') }),
        NOW,
      ),
    ).toBe('active');
  });
});

describe('isChildEffectivelyActive', () => {
  it('is true whenever isActive is true, regardless of exit fields', () => {
    expect(isChildEffectivelyActive(child({ isActive: true }), NOW)).toBe(true);
    expect(
      isChildEffectivelyActive(
        child({
          isActive: true,
          exitType: 'définitive',
          exitDate: iso('2020-01-01'),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('is false when isActive is false and there is no tracked temporary sortie', () => {
    expect(isChildEffectivelyActive(child({ isActive: false }), NOW)).toBe(
      false,
    );
    expect(
      isChildEffectivelyActive(
        child({
          isActive: false,
          exitType: 'définitive',
          exitDate: iso('2026-08-01'),
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('is true when isActive is false but the sortie state is pending/active/returned', () => {
    for (const exitDate of ['2026-08-20', '2026-08-10', '2026-08-01']) {
      expect(
        isChildEffectivelyActive(
          child({
            isActive: false,
            exitType: 'temporaire',
            exitDate: iso(exitDate),
          }),
          NOW,
        ),
      ).toBe(true);
    }
  });
});

describe('getChildEffectiveAttendance', () => {
  it('is "absent" while on an active temporary sortie', () => {
    expect(
      getChildEffectiveAttendance(
        child({ exitType: 'temporaire', exitDate: iso('2026-08-10') }),
        NOW,
      ),
    ).toBe('absent');
  });

  it('is "absent" when the sortie state is "returned"', () => {
    expect(
      getChildEffectiveAttendance(
        child({
          exitType: 'temporaire',
          exitDate: iso('2026-08-10'),
          exitReturnDate: iso('2026-08-15'),
        }),
        NOW,
      ),
    ).toBe('absent');
  });

  it('is "present" for state "none" and state "pending"', () => {
    expect(getChildEffectiveAttendance(child({}), NOW)).toBe('present');
    expect(
      getChildEffectiveAttendance(
        child({ exitType: 'temporaire', exitDate: iso('2026-08-25') }),
        NOW,
      ),
    ).toBe('present');
  });
});

describe('summarizeChildAttendance', () => {
  it('returns zeros for an empty population', () => {
    expect(summarizeChildAttendance([], NOW)).toEqual({
      present: 0,
      absent: 0,
    });
  });

  it('excludes permanently-exited (isActive:false, no tracked sortie) children entirely', () => {
    const children = [
      child({ isActive: false }),
      child({
        isActive: false,
        exitType: 'définitive',
        exitDate: iso('2026-01-01'),
      }),
    ];
    expect(summarizeChildAttendance(children, NOW)).toEqual({
      present: 0,
      absent: 0,
    });
  });

  it('counts a mixed population correctly across every state', () => {
    const children: ChildAttendanceInput[] = [
      // Two ordinary present children (isActive true, no exit fields).
      child({}),
      child({}),
      // Pending departure — still present today.
      child({ exitType: 'temporaire', exitDate: iso('2026-08-25') }),
      // Active sortie — absent, still isActive true.
      child({ exitType: 'temporaire', exitDate: iso('2026-08-15') }),
      // Active sortie, isActive already flipped false — still absent and
      // still counted (this is the documented totalActive-count mismatch).
      child({
        isActive: false,
        exitType: 'temporaire',
        exitDate: iso('2026-08-15'),
      }),
      // Returned but not yet closed out — absent.
      child({
        isActive: false,
        exitType: 'temporaire',
        exitDate: iso('2026-08-01'),
        exitReturnDate: iso('2026-08-05'),
      }),
      // Permanently exited — excluded entirely.
      child({
        isActive: false,
        exitType: 'définitive',
        exitDate: iso('2026-01-01'),
      }),
    ];
    expect(summarizeChildAttendance(children, NOW)).toEqual({
      present: 3,
      absent: 3,
    });
  });

  it('present + absent can exceed a plain isActive:true count (documented semantics)', () => {
    const children: ChildAttendanceInput[] = [
      child({ isActive: true }),
      child({
        isActive: false,
        exitType: 'temporaire',
        exitDate: iso('2026-08-15'),
      }),
    ];
    const isActiveTrueCount = children.filter((c) => c.isActive).length;
    const summary = summarizeChildAttendance(children, NOW);
    expect(summary.present + summary.absent).toBe(2);
    expect(isActiveTrueCount).toBe(1);
    expect(summary.present + summary.absent).not.toBe(isActiveTrueCount);
  });
});
