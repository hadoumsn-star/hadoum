import {
  computeProcedureAlerts,
  ProcedureAlertInput,
} from './administrative-procedure-alerts.util';

// NOW is fixed so every day-relative boundary below is deterministic.
// PROCEDURE_EXPIRATION_WARNING_DAYS/PROCEDURE_RENEWAL_WARNING_DAYS both
// default to 30 (see administrative-procedures.constants.ts) unless
// overridden by env — these tests rely on that default.
const NOW = new Date('2026-08-19T12:00:00.000Z');

function procedure(
  overrides: Partial<ProcedureAlertInput>,
): ProcedureAlertInput {
  return {
    status: 'EN_COURS',
    expirationDate: null,
    renewalDate: null,
    expectedResponseDate: null,
    ...overrides,
  };
}

const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe('computeProcedureAlerts', () => {
  it('flags nothing for a procedure with no deadlines at all', () => {
    const alerts = computeProcedureAlerts(procedure({}), NOW);
    expect(alerts).toMatchObject({
      isExpired: false,
      isExpiringSoon: false,
      isRenewalDueSoon: false,
      isResponseOverdue: false,
      requiresAttention: false,
    });
  });

  it('isExpired: true once expirationDate is in the past, false for ARCHIVE', () => {
    expect(
      computeProcedureAlerts(procedure({ expirationDate: inDays(-1) }), NOW)
        .isExpired,
    ).toBe(true);
    expect(
      computeProcedureAlerts(
        procedure({ status: 'ARCHIVE', expirationDate: inDays(-1) }),
        NOW,
      ).isExpired,
    ).toBe(false);
  });

  it('effectiveStatus becomes EXPIRE once expired, but not for ARCHIVE', () => {
    expect(
      computeProcedureAlerts(procedure({ expirationDate: inDays(-1) }), NOW)
        .effectiveStatus,
    ).toBe('EXPIRE');
    expect(
      computeProcedureAlerts(
        procedure({ status: 'ARCHIVE', expirationDate: inDays(-1) }),
        NOW,
      ).effectiveStatus,
    ).toBe('ARCHIVE');
  });

  it('isExpiringSoon: true within the warning window, false once already expired', () => {
    expect(
      computeProcedureAlerts(procedure({ expirationDate: inDays(10) }), NOW)
        .isExpiringSoon,
    ).toBe(true);
    expect(
      computeProcedureAlerts(procedure({ expirationDate: inDays(90) }), NOW)
        .isExpiringSoon,
    ).toBe(false);
    // Already expired — isExpiringSoon's own !expired guard suppresses it.
    expect(
      computeProcedureAlerts(procedure({ expirationDate: inDays(-1) }), NOW)
        .isExpiringSoon,
    ).toBe(false);
  });

  it('isRenewalDueSoon: independent of expirationDate, driven by renewalDate alone', () => {
    expect(
      computeProcedureAlerts(procedure({ renewalDate: inDays(5) }), NOW)
        .isRenewalDueSoon,
    ).toBe(true);
    expect(
      computeProcedureAlerts(procedure({ renewalDate: inDays(90) }), NOW)
        .isRenewalDueSoon,
    ).toBe(false);
  });

  it('isResponseOverdue: only when status=EN_ATTENTE_REPONSE and the expected date has passed', () => {
    expect(
      computeProcedureAlerts(
        procedure({
          status: 'EN_ATTENTE_REPONSE',
          expectedResponseDate: inDays(-2),
        }),
        NOW,
      ).isResponseOverdue,
    ).toBe(true);
    // Same overdue date, but status isn't EN_ATTENTE_REPONSE — not overdue.
    expect(
      computeProcedureAlerts(
        procedure({ status: 'EN_COURS', expectedResponseDate: inDays(-2) }),
        NOW,
      ).isResponseOverdue,
    ).toBe(false);
    // EN_ATTENTE_REPONSE but the date hasn't passed yet.
    expect(
      computeProcedureAlerts(
        procedure({
          status: 'EN_ATTENTE_REPONSE',
          expectedResponseDate: inDays(2),
        }),
        NOW,
      ).isResponseOverdue,
    ).toBe(false);
  });

  it('ARCHIVE suppresses every flag regardless of dates', () => {
    const alerts = computeProcedureAlerts(
      procedure({
        status: 'ARCHIVE',
        expirationDate: inDays(-100),
        renewalDate: inDays(-100),
        expectedResponseDate: inDays(-100),
      }),
      NOW,
    );
    expect(alerts).toMatchObject({
      isExpired: false,
      isExpiringSoon: false,
      isRenewalDueSoon: false,
      isResponseOverdue: false,
      requiresAttention: false,
    });
  });

  describe('requiresAttention — the union PR 22 centralizes for /dashboard/operations and /dashboard/attention', () => {
    it('is true when any of the four flags is true', () => {
      expect(
        computeProcedureAlerts(procedure({ expirationDate: inDays(-1) }), NOW)
          .requiresAttention,
      ).toBe(true); // isExpired
      expect(
        computeProcedureAlerts(procedure({ expirationDate: inDays(10) }), NOW)
          .requiresAttention,
      ).toBe(true); // isExpiringSoon
      expect(
        computeProcedureAlerts(procedure({ renewalDate: inDays(5) }), NOW)
          .requiresAttention,
      ).toBe(true); // isRenewalDueSoon
      expect(
        computeProcedureAlerts(
          procedure({
            status: 'EN_ATTENTE_REPONSE',
            expectedResponseDate: inDays(-2),
          }),
          NOW,
        ).requiresAttention,
      ).toBe(true); // isResponseOverdue
    });

    it('is false when no flag is true', () => {
      expect(
        computeProcedureAlerts(procedure({ expirationDate: inDays(90) }), NOW)
          .requiresAttention,
      ).toBe(false);
    });
  });
});
