import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { BOARD_CREDENTIALS, loginAsBoard } from './helpers';

// Module 6 (PR 24) — BoardDashboard.tsx was rebuilt from scratch on the real
// Module 6 aggregate backbone. Every mock/hardcoded value the old page had
// (governanceIndicators, the hardcoded "840 000 DA"/"653 400 DA"/
// "186 600 DA" budget block, monthlyTrendData, boardReports/
// documentDeadlines, the toast-only "Exporter la synthèse" button) is gone.
// BOARD's own privacy guarantee is the highest-risk part of this PR: BOARD
// must consume only aggregate GET /dashboard/overview and GET /dashboard/
// trends responses, and must never call a person-level list endpoint
// (children/staff/donors/contacts/donations/incidents/validations/
// communications/donor-reports/campaigns/finances) or the DIRECTOR/
// SUPERVISOR-only GET /dashboard/operations / GET /dashboard/attention
// (both 403 for BOARD at the backend — see DashboardController's own
// @Roles override on those two routes).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const boardToken = (request: APIRequestContext) => apiLogin(request, BOARD_CREDENTIALS.email, BOARD_CREDENTIALS.password);

async function waitForOverviewLoaded(page: Page) {
  await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });
}

// Every path prefix a person-level or DIRECTOR/SUPERVISOR-only aggregate
// endpoint lives under — none of these may ever be requested while BOARD is
// on this dashboard. `/dashboard/overview` and `/dashboard/trends`
// themselves are deliberately NOT in this list (BOARD's own two allowed
// calls); `/dashboard` alone is not listed either, for the same reason —
// each forbidden entry below is specific enough not to also match those.
const FORBIDDEN_PATH_PREFIXES = [
  '/children', '/staff', '/donors', '/contacts', '/donations', '/incidents',
  '/validations', '/communications', '/donor-reports', '/campaigns',
  '/finances', '/stock-items', '/maintenance-tickets',
  '/administrative-procedures', '/supplier-contracts', '/entry-logs',
  '/goods-movement-logs', '/dashboard/operations', '/dashboard/attention',
];

test.describe('Board Dashboard — source has no mock data import', () => {
  test('BoardDashboard.tsx does not import from ../data/mockData', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/app/pages/BoardDashboard.tsx'),
      'utf-8',
    );
    expect(source).not.toMatch(/from ['"]\.\.\/data\/mockData['"]/);
    // The old fake values/identifiers are gone as *code*, not just the
    // import — checked with a leading `const`/JSX-usage shape rather than a
    // bare substring, since this file's own doc comment legitimately
    // mentions them by name to explain what was removed and why.
    expect(source).not.toMatch(/const governanceIndicators/);
    expect(source).not.toMatch(/\{boardReports\.|<boardReports/);
    expect(source).not.toMatch(/data=\{monthlyTrendData\}/);
  });
});

test.describe('Board Dashboard — loads with real Module 6 data', () => {
  test('loads without crashing, header and period selector render', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('board-dashboard')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible();
    await expect(page.getByTestId('dashboard-period-selector')).toHaveValue('month');
  });

  test('overview KPIs (children/staff/finance/donors) match GET /dashboard/overview exactly', async ({ page, request }) => {
    const token = await boardToken(request);
    const overview = await request.get(`${API_BASE}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('kpi-children-total')).toContainText(String(overview.children.totalActive));
    await expect(page.getByTestId('kpi-child-presence-present')).toContainText(String(overview.children.presentToday));
    await expect(page.getByTestId('kpi-child-presence-absent')).toContainText(String(overview.children.absentToday));

    await expect(page.getByTestId('kpi-staff-total')).toContainText(String(overview.staff.totalActive));
    await expect(page.getByTestId('kpi-presence-present')).toContainText(String(overview.staff.presentToday));
    await expect(page.getByTestId('kpi-presence-absent')).toContainText(String(overview.staff.absentToday));
    // No "Non confirmés" staff KPI on BOARD — see BoardDashboard.tsx's own
    // doc comment for why.
    await expect(page.getByTestId('kpi-presence-non-confirmed')).toHaveCount(0);

    await expect(page.getByTestId('kpi-donors-sponsors')).toContainText(String(overview.donors.sponsorsActive));
    await expect(page.getByTestId('kpi-donors-donations')).toContainText(String(overview.donors.donationsCount));
    await expect(page.getByTestId('kpi-donors-campaigns')).toContainText(String(overview.donors.campaignsActive));
  });

  test('finance KPIs use real values in XOF, correct terminology, no DA/mock figures', async ({ page, request }) => {
    const token = await boardToken(request);
    const overview = await request.get(`${API_BASE}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('kpi-budget-total')).toContainText('Budget Total');
    await expect(page.getByTestId('kpi-budget-restant')).toContainText('Budget Restant');
    // Real backend value, formatted in XOF/FCFA (formatXof's own output),
    // never the old hardcoded "840 000 DA"/"653 400 DA"/"186 600 DA".
    const dashboard = page.getByTestId('board-dashboard');
    await expect(dashboard.getByText(/\bDA\b/)).toHaveCount(0);
    await expect(dashboard.getByText('840 000')).toHaveCount(0);
    await expect(dashboard.getByText('653 400')).toHaveCount(0);
    await expect(dashboard.getByText('Budget consommé')).toHaveCount(0);
    if (overview.finance.budgetTotalXof !== 0) {
      // Anchored at the start — a real non-zero value like "957 500 FCFA"
      // would otherwise false-fail a bare `.not.toContainText('0 FCFA')`
      // (it ends in "...500 FCFA", itself containing "0 FCFA").
      await expect(page.getByTestId('kpi-budget-total')).not.toHaveText(/^0 FCFA/);
    }
  });

  test('KPI cards are non-interactive (no drill-down — BOARD has no access to /app/children, /app/team, /app/finances, /app/donateurs)', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    for (const testId of [
      'kpi-children-total', 'kpi-child-presence-present', 'kpi-child-presence-absent',
      'kpi-staff-total', 'kpi-presence-present', 'kpi-presence-absent',
      'kpi-budget-total', 'kpi-budget-restant',
      'kpi-donors-sponsors', 'kpi-donors-donations', 'kpi-donors-campaigns',
    ]) {
      const tag = await page.getByTestId(testId).evaluate(el => el.tagName);
      expect(tag).toBe('DIV');
    }
  });
});

test.describe('Board Dashboard — Tendances (Module 6 charts)', () => {
  test('Recettes vs Dépenses and Évolution des dons charts render', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chart-finance')).toContainText('Recettes vs Dépenses');
    await expect(page.getByTestId('chart-donations')).toContainText('Évolution des dons');

    const financeChart = page.getByTestId('chart-finance');
    const financeEmpty = financeChart.getByTestId('chart-finance-empty');
    // .first() — a populated chart has multiple svg.recharts-surface
    // elements (the chart itself plus one per legend swatch); this only
    // needs to know at least one rendered, not disambiguate which.
    const financeSvg = financeChart.locator('svg.recharts-surface').first();
    await expect(financeEmpty.or(financeSvg)).toBeVisible({ timeout: 10_000 });

    const donationsChart = page.getByTestId('chart-donations');
    const donationsEmpty = donationsChart.getByTestId('chart-donations-empty');
    const donationsSvg = donationsChart.locator('svg.recharts-surface').first();
    await expect(donationsEmpty.or(donationsSvg)).toBeVisible({ timeout: 10_000 });
  });

  test('period selector changing re-fetches /dashboard/trends with the new period', async ({ page }) => {
    const trendsRequests: string[] = [];
    await page.route('**/dashboard/trends**', route => { trendsRequests.push(route.request().url()); return route.continue(); });

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('dashboard-period-selector').selectOption('year');
    await expect.poll(() => trendsRequests.some(u => u.includes('period=year'))).toBe(true);
  });
});

test.describe('Board Dashboard — no Director/Supervisor-only content', () => {
  test('no "À traiter" attention feed', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('a-traiter')).toHaveCount(0);
    await expect(page.getByTestId('a-traiter-empty')).toHaveCount(0);
    await expect(page.getByTestId('section-title-a-traiter')).toHaveCount(0);
  });

  test('no Opérations section', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('operations-cards')).toHaveCount(0);
    await expect(page.getByTestId('section-title-operations')).toHaveCount(0);
  });

  test('no PendingValidationsList ("Demandes à valider")', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('board-dashboard').getByText('Demandes à valider')).toHaveCount(0);
  });

  test('no Director Quick Actions', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('quick-action-add-child')).toHaveCount(0);
    await expect(page.getByTestId('quick-action-attendance')).toHaveCount(0);
    await expect(page.getByTestId('quick-action-reports')).toHaveCount(0);
  });

  test('the fake "Exporter la synthèse" export button is gone (no real export backend exists — see BoardDashboard.tsx\'s own decision note)', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByRole('button', { name: /Exporter/i })).toHaveCount(0);
  });

  test('no person-level identifiers (an email address) ever render on this dashboard', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    const bodyText = await page.getByTestId('board-dashboard').innerText();
    expect(bodyText).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });
});

test.describe('Board Dashboard — privacy: only aggregate endpoints are ever called', () => {
  test('no person-level list API and no DIRECTOR/SUPERVISOR-only dashboard endpoint is requested on load or period change', async ({ page }) => {
    const requestedPaths: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.pathname.startsWith('/api/')) requestedPaths.push(url.pathname.slice('/api'.length));
    });

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });

    // Also exercise a period change — the one other trigger for a fresh
    // fetch on this page.
    await page.getByTestId('dashboard-period-selector').selectOption('week');
    await waitForOverviewLoaded(page);

    for (const prefix of FORBIDDEN_PATH_PREFIXES) {
      const offender = requestedPaths.find(p => p.startsWith(prefix));
      expect(offender, `forbidden request to ${prefix} (found: ${offender})`).toBeUndefined();
    }
    // Sanity: the allowed calls did actually happen — an empty capture
    // would make the assertions above vacuously true.
    expect(requestedPaths.some(p => p.startsWith('/dashboard/overview'))).toBe(true);
    expect(requestedPaths.some(p => p.startsWith('/dashboard/trends'))).toBe(true);
  });

  test('backend itself 403s BOARD on /dashboard/operations and /dashboard/attention (defense in depth — not just a frontend omission)', async ({ request }) => {
    const token = await boardToken(request);
    const opsRes = await request.get(`${API_BASE}/dashboard/operations`, { headers: { Authorization: `Bearer ${token}` } });
    expect(opsRes.status()).toBe(403);
    const attnRes = await request.get(`${API_BASE}/dashboard/attention`, { headers: { Authorization: `Bearer ${token}` } });
    expect(attnRes.status()).toBe(403);
  });
});

test.describe('Board Dashboard — empty and error states', () => {
  test('renders 0s (never fabricated numbers) when the backend returns an all-zero overview', async ({ page }) => {
    await page.route('**/dashboard/overview**', route => route.fulfill({
      json: {
        period: { type: 'month', start: new Date().toISOString(), end: new Date().toISOString() },
        children: { totalActive: 0, presentToday: 0, absentToday: 0 },
        staff: { totalActive: 0, presentToday: 0, absentToday: 0, nonConfirmedToday: 0 },
        finance: { budgetTotalXof: 0, budgetRestantXof: 0 },
        donors: { sponsorsActive: 0, donationsCount: 0, campaignsActive: 0 },
      },
    }));

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('kpi-children-total')).toContainText('0');
    await expect(page.getByTestId('kpi-donors-sponsors')).toContainText('0');
  });

  test('an /dashboard/overview failure shows a real error/retry state, never fake data', async ({ page }) => {
    await page.route('**/dashboard/overview**', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('overview-error')).toBeVisible({ timeout: 10_000 });
    // None of the old hardcoded fallback values ever appear.
    const dashboard = page.getByTestId('board-dashboard');
    await expect(dashboard.getByText('840 000')).toHaveCount(0);
    await expect(dashboard.getByText(/\bDA\b/)).toHaveCount(0);

    await page.unroute('**/dashboard/overview**');
    await dashboard.getByTestId('overview-error').getByRole('button', { name: 'Réessayer' }).click();
    await waitForOverviewLoaded(page);
  });

  test('a /dashboard/trends failure shows a retry state but keeps overview KPIs visible (partial rendering)', async ({ page }) => {
    await page.route('**/dashboard/trends**', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('tendances-error')).toBeVisible({ timeout: 10_000 });
    await waitForOverviewLoaded(page);
  });
});

test.describe('Board Dashboard — responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow at mobile width (375×812)', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe('Board Dashboard — tablet layout', () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  test('renders every section with no horizontal overflow at tablet width', async ({ page }) => {
    await loginAsBoard(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
