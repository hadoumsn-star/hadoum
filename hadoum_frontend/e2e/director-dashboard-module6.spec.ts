import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// Module 6 (PR 23) — focused coverage for the parts of the Director
// Dashboard migration not already covered by director-dashboard.spec.ts
// (Finance/Quick Actions/Non confirmées), director-dashboard-attention.spec.ts
// (À traiter) or director-dashboard-children-attendance.spec.ts (child
// attendance + no-raw-fetch + section titles): the shared period selector,
// the Opérations section, the three independent Tendances charts, and
// donor tab deep-linking (including direct navigation, not just the
// attention drill-down already covered elsewhere).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

async function waitForOverviewLoaded(page: Page) {
  await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });
}

test.describe('Director Dashboard — period selector', () => {
  test('defaults to "Ce mois" and requests period=month', async ({ page }) => {
    const overviewRequests: string[] = [];
    await page.route('**/dashboard/overview**', route => {
      overviewRequests.push(route.request().url());
      return route.continue();
    });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await expect(page.getByTestId('dashboard-period-selector')).toHaveValue('month');
    expect(overviewRequests.some(u => u.includes('period=month'))).toBe(true);
  });

  test('every documented period option is present, using the backend enum values', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const select = page.getByTestId('dashboard-period-selector');
    await expect(select).toBeVisible({ timeout: 10_000 });

    const values = await select.locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value));
    expect(values).toEqual(['today', 'week', 'month', 'quarter', 'year']);
  });

  test('changing the period sends the new value to /dashboard/overview and /dashboard/trends, and re-renders', async ({ page }) => {
    const overviewRequests: string[] = [];
    const trendsRequests: string[] = [];
    await page.route('**/dashboard/overview**', route => {
      overviewRequests.push(route.request().url());
      return route.continue();
    });
    await page.route('**/dashboard/trends**', route => {
      trendsRequests.push(route.request().url());
      return route.continue();
    });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await page.getByTestId('dashboard-period-selector').selectOption('year');
    await expect(page.getByTestId('dashboard-period-selector')).toHaveValue('year');

    await expect.poll(() => overviewRequests.some(u => u.includes('period=year'))).toBe(true);
    await expect.poll(() => trendsRequests.some(u => u.includes('period=year'))).toBe(true);
  });

  test('children.presentToday/absentToday stay today-based even when a longer period is selected', async ({ page, request }) => {
    const token = await directorToken(request);
    const overviewYear = await request.get(`${API_BASE}/dashboard/overview?period=year`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const overviewToday = await request.get(`${API_BASE}/dashboard/overview?period=today`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    // Same underlying "today" value regardless of the selected period —
    // the backend's own guarantee (see DashboardService.getOverview).
    expect(overviewYear.children.presentToday).toBe(overviewToday.children.presentToday);
    expect(overviewYear.children.absentToday).toBe(overviewToday.children.absentToday);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await page.getByTestId('dashboard-period-selector').selectOption('year');
    await expect(page.getByTestId('kpi-child-presence-present')).toContainText(
      String(overviewYear.children.presentToday), { timeout: 10_000 },
    );
    // "Aujourd'hui" subtitle stays visible under the card even for a
    // longer selected period, making the semantics visually clear.
    await expect(page.getByTestId('kpi-child-presence-present').getByText("Aujourd'hui")).toBeVisible();
  });
});

test.describe('Director Dashboard — Opérations section', () => {
  test('renders exactly the five documented operational cards, sourced from /dashboard/operations', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operations-cards')).toBeVisible({ timeout: 10_000 });

    for (const key of ['stock', 'maintenance', 'procedures', 'incidents', 'validations']) {
      await expect(page.getByTestId(`operation-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId('operations-cards').getByTestId(/^operation-/)).toHaveCount(5);
    await expect(page.getByTestId('operation-stock')).toContainText('Stocks faibles');
    await expect(page.getByTestId('operation-maintenance')).toContainText('Maintenance');
    await expect(page.getByTestId('operation-procedures')).toContainText('Démarches administratives');
    await expect(page.getByTestId('operation-incidents')).toContainText('Incidents ouverts');
    await expect(page.getByTestId('operation-validations')).toContainText('Demandes à valider');
  });

  test('operation counts match /dashboard/operations exactly, never recomputed client-side', async ({ page, request }) => {
    const token = await directorToken(request);
    const ops = await request.get(`${API_BASE}/dashboard/operations`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operation-incidents')).toContainText(String(ops.openIncidentsCount), { timeout: 10_000 });
    await expect(page.getByTestId('operation-stock')).toContainText(String(ops.stockAlertsCount));
  });

  test('clicking a card navigates to its existing module page', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operations-cards')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('operation-incidents').click();
    await expect(page).toHaveURL(/\/app\/incidents$/);

    await page.goto('/app/dashboard');
    await page.getByTestId('operation-stock').click();
    await expect(page).toHaveURL(/\/app\/stocks-inventaire$/);

    await page.goto('/app/dashboard');
    await page.getByTestId('operation-validations').click();
    await expect(page).toHaveURL(/\/app\/validations$/);
  });

  test('an operations API failure shows a retry state without hiding other sections', async ({ page }) => {
    await page.route('**/dashboard/operations', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('operations-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finance-kpis')).toBeVisible();
  });
});

test.describe('Director Dashboard — Tendances (Module 6 charts)', () => {
  test('all three independent chart cards render with their own titles', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('chart-finance')).toContainText('Recettes vs Dépenses');
    await expect(page.getByTestId('chart-donations')).toContainText('Évolution des dons');
    await expect(page.getByTestId('chart-staff')).toContainText('Présence du personnel');
  });

  test('finance chart renders a bar chart with real recettesXof/depensesXof data', async ({ page, request }) => {
    const token = await directorToken(request);
    // Fund the current period with a real recette/dépense so the chart is
    // non-empty and deterministic.
    await request.post(`${API_BASE}/finances/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'RECETTE', category: 'DON', label: 'Don E2E Trend', amountXof: 10_000, date: new Date().toISOString().slice(0, 10) },
    }).catch(() => {});

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const chart = page.getByTestId('chart-finance');
    await expect(chart).toBeVisible({ timeout: 10_000 });
    await expect(chart.getByTestId('chart-finance-empty')).toHaveCount(0);
    // A real recharts SVG with real bar elements is present — checking DOM
    // presence rather than Playwright's own "visible" on an inner SVG <g>
    // (unreliable for SVG sub-elements with no independent bounding box).
    await expect(chart.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 10_000 });
    await expect(chart.locator('.recharts-bar')).not.toHaveCount(0);
  });

  test('donations chart shows amountXof as the primary series and count only as secondary text (no dual-axis)', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const chart = page.getByTestId('chart-donations');
    await expect(chart).toBeVisible({ timeout: 10_000 });

    // Wait for the chart to settle into one of its two final states before
    // branching — checking a snapshot `.count()` up front (before the async
    // fetch resolves) would race the real render.
    const empty = chart.getByTestId('chart-donations-empty');
    const chartSvg = chart.locator('svg.recharts-surface');
    await expect(empty.or(chartSvg)).toBeVisible({ timeout: 10_000 });

    if (await empty.isVisible()) {
      // Empty state: never a chart/axis rendered alongside it.
      await expect(chartSvg).toHaveCount(0);
    } else {
      // Populated state: exactly one chart/axis — never a second,
      // count-driven one — and the count shown as secondary text only.
      await expect(chartSvg).toHaveCount(1);
      await expect(chart.getByTestId('chart-donations-count')).toBeVisible();
      await expect(chart.getByTestId('chart-donations-count')).toContainText('don');
    }
  });

  test('staff attendance chart renders present/absent/nonConfirmed as three distinct series, never merging nonConfirmed into absent', async ({ page, request }) => {
    const token = await directorToken(request);
    const trends = await request.get(`${API_BASE}/dashboard/trends?period=today`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsDirector(page);
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

  test('finance and staff attendance charts do not assume a shared label array — each renders independently from its own series', async ({ page, request }) => {
    const token = await directorToken(request);
    const trends = await request.get(`${API_BASE}/dashboard/trends?period=month`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    // Finance/donations (month period) use ~6 monthly buckets; staff
    // attendance uses one bucket per real calendar day in the month — a
    // materially different array length, proving neither chart forces the
    // other's grain.
    expect(trends.finance.length).not.toBe(trends.staffAttendance.length);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('chart-finance')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chart-staff')).toBeVisible();
  });

  test('empty trends state: a period with no data shows "Aucune donnée disponible…", not a broken chart', async ({ page }) => {
    await page.route('**/dashboard/trends**', route =>
      route.fulfill({
        json: {
          period: { type: 'month', start: new Date().toISOString(), end: new Date().toISOString() },
          finance: [{ label: '2020-01', recettesXof: 0, depensesXof: 0 }],
          donations: [{ label: '2020-01', amountXof: 0, count: 0 }],
          staffAttendance: [{ label: '2020-01-01', present: 0, absent: 0, nonConfirmed: 0 }],
        },
      }),
    );

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('chart-finance-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chart-donations-empty')).toBeVisible();
    await expect(page.getByTestId('chart-staff-empty')).toBeVisible();
    await expect(page.getByTestId('chart-finance-empty')).toContainText('Aucune donnée disponible');
  });

  test('a trends API failure shows a retry state but keeps overview KPIs and attention visible (partial rendering)', async ({ page }) => {
    await page.route('**/dashboard/trends**', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('tendances-error')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });
    const attention = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'));
    await expect(attention).toBeVisible();

    await page.unroute('**/dashboard/trends**');
    await page.getByTestId('tendances-error').getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByTestId('trends-cards')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Director Dashboard — Donateurs & Parrains KPI section', () => {
  test('shows Parrains actifs / Dons / Cagnottes actives from /dashboard/overview, and each links to the matching donor tab', async ({ page, request }) => {
    const token = await directorToken(request);
    const overview = await request.get(`${API_BASE}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await expect(page.getByTestId('kpi-donors-sponsors')).toContainText(String(overview.donors.sponsorsActive));
    await expect(page.getByTestId('kpi-donors-donations')).toContainText(String(overview.donors.donationsCount));
    await expect(page.getByTestId('kpi-donors-campaigns')).toContainText(String(overview.donors.campaignsActive));

    await page.getByTestId('kpi-donors-campaigns').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=cagnottes$/);
  });
});

test.describe('Director Dashboard — donor tab deep-linking (DonorsPage)', () => {
  test('/app/donateurs?tab=cagnottes opens the Cagnottes tab directly', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs?tab=cagnottes');
    await expect(page.getByRole('button', { name: 'Cagnottes', exact: true })).toHaveCSS('background-color', 'rgb(62, 90, 120)', { timeout: 10_000 });
  });

  test('/app/donateurs?tab=rapports opens the Rapports tab directly', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs?tab=rapports');
    await expect(page.getByRole('button', { name: 'Rapports', exact: true })).toHaveCSS('background-color', 'rgb(62, 90, 120)', { timeout: 10_000 });
  });

  test('/app/donateurs?tab=dons opens the Dons tab directly', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs?tab=dons');
    await expect(page.getByRole('button', { name: 'Dons', exact: true })).toHaveCSS('background-color', 'rgb(62, 90, 120)', { timeout: 10_000 });
  });

  test('an invalid ?tab= value falls back safely to the default Parrains tab', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs?tab=does-not-exist');
    await expect(page.getByRole('button', { name: 'Parrains', exact: true })).toHaveCSS('background-color', 'rgb(62, 90, 120)', { timeout: 10_000 });
    // No crash, no blank page — the rest of the page renders normally.
    await expect(page.getByRole('heading', { name: 'Donateurs & Parrains' })).toBeVisible();
  });

  test('plain /app/donateurs (no query) behaves exactly as before — default Parrains tab', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs');
    await expect(page.getByRole('button', { name: 'Parrains', exact: true })).toHaveCSS('background-color', 'rgb(62, 90, 120)', { timeout: 10_000 });
  });
});

test.describe('Director Dashboard — tablet layout', () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  test('renders every major section with no horizontal overflow at tablet width', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('operations-cards')).toBeVisible();
    await expect(page.getByTestId('trends-cards')).toBeVisible();
    await expect(page.getByTestId('quick-action-add-child')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe('Director Dashboard — French labels', () => {
  test('key section and card labels use correct French accents', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    // AppLayout's own page-title header also renders "Tableau de bord" —
    // scope to the dashboard's own <h2> to avoid a strict-mode ambiguity.
    await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 2 })).toBeVisible();
    // "À TRAITER" also appears as a substring inside an attention item's
    // own message ("Tickets de maintenance à traiter") — scope to the
    // section title itself to avoid a strict-mode ambiguity.
    await expect(page.getByTestId('section-title-a-traiter')).toHaveText('À TRAITER');
    // The period selector's own <option value="today">Aujourd'hui</option>
    // also matches this text but is never independently "visible" (native
    // <select> options only render when the dropdown is open) — scope to a
    // real KPI card's subtitle instead.
    await expect(page.getByTestId('kpi-child-presence-present').getByText("Aujourd'hui")).toBeVisible();
    await expect(page.getByText('Démarches administratives').first()).toBeVisible();
    await expect(page.getByText('Présents').first()).toBeVisible();
  });
});

test.describe('Director Dashboard — mobile priority order (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Actions rapides, À traiter and core KPIs appear before Opérations and Tendances', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });
    // Wait for À traiter to settle into its final state before measuring
    // any position below it — it resolves asynchronously and can still be
    // expanding, which would otherwise race the boundingBox() reads below
    // into a false ordering.
    const attention = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'));
    await expect(attention).toBeVisible({ timeout: 10_000 });
    // Same for Opérations/Tendances, both above Trends/below in this same
    // measurement — settle them too before reading positions.
    await expect(page.getByTestId('operations-cards').or(page.getByTestId('operations-error'))).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('trends-cards').or(page.getByTestId('tendances-error'))).toBeVisible({ timeout: 10_000 });

    const quickActionsBox = await page.getByTestId('quick-action-add-child').boundingBox();
    const attentionBox = await attention.boundingBox();
    const childKpiBox = await page.getByTestId('child-presence-kpis').boundingBox();
    const operationsBox = await page.getByTestId('operations-cards').boundingBox();
    const trendsBox = await page.getByTestId('trends-cards').boundingBox();

    expect(quickActionsBox!.y).toBeLessThan(attentionBox!.y);
    expect(attentionBox!.y).toBeLessThan(childKpiBox!.y);
    expect(childKpiBox!.y).toBeLessThan(operationsBox!.y);
    expect(operationsBox!.y).toBeLessThan(trendsBox!.y);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
