import {
  computeCampaignAlerts,
  CampaignAlertInput,
  CAMPAIGN_ENDING_SOON_DAYS,
} from './campaign-alerts.util';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function campaign(overrides: Partial<CampaignAlertInput>): CampaignAlertInput {
  return { status: 'ACTIVE', endDate: null, ...overrides };
}

describe('computeCampaignAlerts', () => {
  it('flags nothing for a campaign with no endDate', () => {
    expect(computeCampaignAlerts(campaign({}), NOW)).toEqual({
      isEndingSoon: false,
      isEndDatePassed: false,
    });
  });

  it('isEndDatePassed: true once endDate is in the past, only for ACTIVE campaigns', () => {
    expect(
      computeCampaignAlerts(campaign({ endDate: inDays(-1) }), NOW)
        .isEndDatePassed,
    ).toBe(true);
    expect(
      computeCampaignAlerts(
        campaign({ status: 'TERMINEE', endDate: inDays(-1) }),
        NOW,
      ).isEndDatePassed,
    ).toBe(false);
    expect(
      computeCampaignAlerts(
        campaign({ status: 'BROUILLON', endDate: inDays(-1) }),
        NOW,
      ).isEndDatePassed,
    ).toBe(false);
    expect(
      computeCampaignAlerts(
        campaign({ status: 'ANNULEE', endDate: inDays(-1) }),
        NOW,
      ).isEndDatePassed,
    ).toBe(false);
  });

  it(`isEndingSoon: true within ${CAMPAIGN_ENDING_SOON_DAYS} days of endDate, false once already passed`, () => {
    expect(
      computeCampaignAlerts(campaign({ endDate: inDays(3) }), NOW).isEndingSoon,
    ).toBe(true);
    expect(
      computeCampaignAlerts(campaign({ endDate: inDays(30) }), NOW)
        .isEndingSoon,
    ).toBe(false);
    // Already passed — isEndingSoon's own !isEndDatePassed guard suppresses it.
    const alerts = computeCampaignAlerts(
      campaign({ endDate: inDays(-1) }),
      NOW,
    );
    expect(alerts.isEndDatePassed).toBe(true);
    expect(alerts.isEndingSoon).toBe(false);
  });

  it('never flags a non-ACTIVE campaign, regardless of dates', () => {
    for (const status of ['BROUILLON', 'TERMINEE', 'ANNULEE'] as const) {
      expect(
        computeCampaignAlerts(campaign({ status, endDate: inDays(-5) }), NOW),
      ).toEqual({ isEndingSoon: false, isEndDatePassed: false });
    }
  });
});
