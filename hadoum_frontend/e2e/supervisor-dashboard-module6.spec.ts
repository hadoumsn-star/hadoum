import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { SUPERVISOR_CREDENTIALS, loginAsSupervisor } from './helpers';

// Module 6 (PR 24) — SUPERVISOR was upgraded from a minimal validations-only
// page into a real management/oversight dashboard, reusing the exact same
// Module 6 aggregate backbone (overview/operations/trends/attention) and
// the exact same shared components (../src/app/components/dashboard) as
// DirectorDashboard — see supervisor-validation-consistency.spec.ts and
// supervisor-dashboard-finance-widget.spec.ts for the pre-existing
// "Demandes à valider" coverage this file doesn't repeat, and
// director-dashboard-module6.spec.ts/director-dashboard-attention.spec.ts
// for the equivalent Director-side coverage this file mirrors for
// SUPERVISOR. SUPERVISOR stays strictly read-only on this page: every
// approve/reject control here belongs to <PendingValidationsList />'s own,
// pre-existing validation workflow, never to a dashboard-introduced
// mutation.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const supervisorToken = (request: APIRequestContext) => apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);

async function waitForOverviewLoaded(page: Page) {
  await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });
}

test.describe('Supervisor Dashboard — Module 6 upgrade', () => {
  test('loads with the real dashboard content (no crash, no blank page)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('supervisor-dashboard')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });
  });

  test('defaults to "Ce mois" and requests period=month from /dashboard/overview', async ({ page }) => {
    const overviewRequests: string[] = [];
    await page.route('**/dashboard/overview**', route => {
      overviewRequests.push(route.request().url());
      return route.continue();
    });

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('dashboard-period-selector')).toHaveValue('month');
    expect(overviewRequests.some(u => u.includes('period=month'))).toBe(true);
  });

  test('the period selector offers the same five backend period values as Director, and changing it re-fetches overview/trends', async ({ page }) => {
    const overviewRequests: string[] = [];
    const trendsRequests: string[] = [];
    await page.route('**/dashboard/overview**', route => { overviewRequests.push(route.request().url()); return route.continue(); });
    await page.route('**/dashboard/trends**', route => { trendsRequests.push(route.request().url()); return route.continue(); });

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const select = page.getByTestId('dashboard-period-selector');
    await expect(select).toBeVisible({ timeout: 10_000 });
    const values = await select.locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value));
    expect(values).toEqual(['today', 'week', 'month', 'quarter', 'year']);

    await select.selectOption('year');
    await expect(select).toHaveValue('year');
    await expect.poll(() => overviewRequests.some(u => u.includes('period=year'))).toBe(true);
    await expect.poll(() => trendsRequests.some(u => u.includes('period=year'))).toBe(true);
  });
});

test.describe('Supervisor Dashboard — Overview KPIs', () => {
  test('children/staff/finance/donor KPI sections all render from /dashboard/overview', async ({ page, request }) => {
    const token = await supervisorToken(request);
    const overview = await request.get(`${API_BASE}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('kpi-children-total')).toContainText(String(overview.children.totalActive));
    await expect(page.getByTestId('kpi-child-presence-present')).toContainText(String(overview.children.presentToday));
    await expect(page.getByTestId('kpi-child-presence-absent')).toContainText(String(overview.children.absentToday));

    await expect(page.getByTestId('kpi-staff-total')).toContainText(String(overview.staff.totalActive));
    await expect(page.getByTestId('kpi-presence-present')).toContainText(String(overview.staff.presentToday));
    await expect(page.getByTestId('kpi-presence-absent')).toContainText(String(overview.staff.absentToday));
    await expect(page.getByTestId('kpi-presence-non-confirmed')).toContainText(String(overview.staff.nonConfirmedToday));

    await expect(page.getByTestId('kpi-donors-sponsors')).toContainText(String(overview.donors.sponsorsActive));
    await expect(page.getByTestId('kpi-donors-donations')).toContainText(String(overview.donors.donationsCount));
    await expect(page.getByTestId('kpi-donors-campaigns')).toContainText(String(overview.donors.campaignsActive));
  });

  test('donor KPIs link to the same /app/donateurs?tab=… convention as Director', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await page.getByTestId('kpi-donors-campaigns').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=cagnottes$/);
  });

  test('finance terminology: "Budget Total" and "Budget Restant" in XOF, never "Solde caisse"/"Budget alloué"/DA', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('kpi-budget-total')).toContainText('Budget Total');
    await expect(page.getByTestId('kpi-budget-restant')).toContainText('Budget Restant');
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText('Solde caisse')).toHaveCount(0);
    await expect(dashboard.getByText('Budget alloué')).toHaveCount(0);
    await expect(dashboard.getByText(/\bDA\b/)).toHaveCount(0);
  });

  test('staff presence KPI cards are non-interactive (no navigation — SUPERVISOR has no access to /app/team)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    const tag = await page.getByTestId('kpi-staff-total').evaluate(el => el.tagName);
    expect(tag).toBe('DIV');
    const nonConfirmedTag = await page.getByTestId('kpi-presence-non-confirmed').evaluate(el => el.tagName);
    expect(nonConfirmedTag).toBe('DIV');
  });
});

test.describe('Supervisor Dashboard — Demandes à valider stays visible alongside Module 6', () => {
  test('"Demandes à valider" (PendingValidationsList) still renders on the upgraded dashboard', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByRole('heading', { name: 'Demandes à valider' })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Supervisor Dashboard — Opérations section', () => {
  test('renders the five documented operational cards, sourced from /dashboard/operations', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operations-cards')).toBeVisible({ timeout: 10_000 });

    for (const key of ['stock', 'maintenance', 'procedures', 'incidents', 'validations']) {
      await expect(page.getByTestId(`operation-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId('operation-incidents')).toContainText('Incidents ouverts');
  });

  test('an operations API failure shows a retry state without hiding overview KPIs', async ({ page }) => {
    await page.route('**/dashboard/operations', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operations-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finance-kpis')).toBeVisible();
  });
});

test.describe('Supervisor Dashboard — À traiter (attention feed)', () => {
  test('renders the same current-state attention feed as Director', async ({ page, request }) => {
    const token = await supervisorToken(request);
    const attention = await request.get(`${API_BASE}/dashboard/attention`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const feed = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'));
    await expect(feed).toBeVisible({ timeout: 10_000 });

    if (attention.items.length === 0) {
      await expect(page.getByTestId('a-traiter-empty')).toBeVisible();
    } else {
      await expect(page.getByTestId(`attention-item-${attention.items[0].key}`)).toBeVisible();
    }
  });

  test('an attention item\'s "Voir" navigates to its own targetPath', async ({ page }) => {
    await page.route('**/dashboard/attention', route =>
      route.fulfill({
        json: {
          summary: { total: 1, critical: 0, warning: 1, info: 0 },
          items: [{
            key: 'incidents-open', domain: 'INCIDENTS', severity: 'WARNING',
            title: 'Incidents ouverts', message: '2 incident(s) non résolu(s).',
            count: 2, targetPath: '/app/incidents',
          }],
        },
      }),
    );

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-incidents-open');
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.getByTestId('attention-action-incidents-open').click();
    await expect(page).toHaveURL(/\/app\/incidents$/);
  });

  test('a campaigns-ending-soon attention item opens the Cagnottes tab', async ({ page }) => {
    await page.route('**/dashboard/attention', route =>
      route.fulfill({
        json: {
          summary: { total: 1, critical: 0, warning: 1, info: 0 },
          items: [{
            key: 'campaigns-ending-soon', domain: 'CAMPAIGNS', severity: 'WARNING',
            title: 'Cagnottes bientôt terminées', message: '1 cagnotte(s) se termine(nt) bientôt.',
            count: 1, targetPath: '/app/donateurs',
          }],
        },
      }),
    );

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-campaigns-ending-soon');
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.getByTestId('attention-action-campaigns-ending-soon').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=cagnottes$/);
  });

  test('a donor-reports-to-prepare attention item opens the Rapports tab', async ({ page }) => {
    await page.route('**/dashboard/attention', route =>
      route.fulfill({
        json: {
          summary: { total: 1, critical: 0, warning: 0, info: 1 },
          items: [{
            key: 'donor-reports-to-prepare', domain: 'DONOR_REPORTS', severity: 'INFO',
            title: 'Rapports donateurs à préparer', message: '1 rapport donateur à préparer.',
            count: 1, targetPath: '/app/donateurs',
          }],
        },
      }),
    );

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-donor-reports-to-prepare');
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.getByTestId('attention-action-donor-reports-to-prepare').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=rapports$/);
  });
});

test.describe('Supervisor Dashboard — Tendances (Module 6 charts)', () => {
  test('all three chart cards render with their own titles', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('chart-finance')).toContainText('Recettes vs Dépenses');
    await expect(page.getByTestId('chart-donations')).toContainText('Évolution des dons');
    await expect(page.getByTestId('chart-staff')).toContainText('Présence du personnel');
  });

  test('finance chart renders a real bar chart (or its documented empty state)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const chart = page.getByTestId('chart-finance');
    await expect(chart).toBeVisible({ timeout: 10_000 });
    const empty = chart.getByTestId('chart-finance-empty');
    // .first() — a populated chart has multiple svg.recharts-surface
    // elements (the chart itself plus one per legend swatch).
    const svg = chart.locator('svg.recharts-surface').first();
    await expect(empty.or(svg)).toBeVisible({ timeout: 10_000 });
  });

  test('donations chart shows amountXof as the primary series, count as secondary text only', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const chart = page.getByTestId('chart-donations');
    await expect(chart).toBeVisible({ timeout: 10_000 });
    const empty = chart.getByTestId('chart-donations-empty');
    const svg = chart.locator('svg.recharts-surface');
    await expect(empty.or(svg)).toBeVisible({ timeout: 10_000 });
    if (!(await empty.isVisible())) {
      await expect(chart.getByTestId('chart-donations-count')).toBeVisible();
    }
  });

  test('staff attendance chart renders present/absent/nonConfirmed as three distinct series', async ({ page, request }) => {
    const token = await supervisorToken(request);
    const trends = await request.get(`${API_BASE}/dashboard/trends?period=today`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await page.getByTestId('dashboard-period-selector').selectOption('today');
    const chart = page.getByTestId('chart-staff');
    await expect(chart).toBeVisible({ timeout: 10_000 });

    if (trends.staffAttendance.some((p: { present: number; absent: number; nonConfirmed: number }) => p.present + p.absent + p.nonConfirmed > 0)) {
      await expect(chart.getByText('Présents')).toBeVisible({ timeout: 10_000 });
      await expect(chart.getByText('Absents')).toBeVisible();
      await expect(chart.getByText('Non confirmés')).toBeVisible();
    }
  });

  test('a trends API failure shows a retry state but keeps overview KPIs visible (partial rendering)', async ({ page }) => {
    await page.route('**/dashboard/trends**', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('tendances-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });
  });
});

test.describe('Supervisor Dashboard — no Director-only content, no dashboard-introduced mutations', () => {
  test('shows no Quick Actions (Ajouter un enfant / Saisir présences / Générer un rapport)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('quick-action-add-child')).toHaveCount(0);
    await expect(page.getByTestId('quick-action-attendance')).toHaveCount(0);
    await expect(page.getByTestId('quick-action-reports')).toHaveCount(0);
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText('ACTIONS RAPIDES')).toHaveCount(0);
  });

  test('no "Non confirmés" modal is reachable from this dashboard (SUPERVISOR has no /app/team access)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('non-confirmed-modal')).toHaveCount(0);
  });
});

test.describe('Supervisor Dashboard — responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow at mobile width (375×812), period selector and validations reachable', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('supervisor-dashboard').getByRole('heading', { name: 'Demandes à valider' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('operations-cards').or(page.getByTestId('operations-error'))).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe('Supervisor Dashboard — tablet layout', () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  test('renders every major section with no horizontal overflow at tablet width', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('operations-cards').or(page.getByTestId('operations-error'))).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('trends-cards').or(page.getByTestId('tendances-error'))).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
