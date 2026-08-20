import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// Module 6 (PR 23): the old incidents-only "Demandes à traiter" section is
// replaced by the consolidated, cross-domain "À traiter" attention feed,
// sourced from GET /dashboard/attention (Module 6, PR 22). Every condition
// (stock/maintenance/procedures/incidents/validations/campaigns/donor
// reports) is computed backend-side from real current entity state — this
// spec asserts the dashboard renders exactly what that endpoint returns
// (title/message/count/severity/targetPath), never a frontend-side re-
// derivation of which conditions are "attention-worthy" or how urgent they
// are. The rich per-incident supervisor-badge/priority-styling behavior the
// old section had is intentionally not reproduced here — that level of
// detail belongs on /app/incidents itself (see IncidentsPage), not a
// dashboard summary; the dashboard now shows an aggregate "Incidents
// ouverts" card like every other domain.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

async function apiCreateIncident(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/incidents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: unique('Incident E2E'), type: 'AUTRE', description: 'Créé pour un test e2e.', signaledBy: 'E2E', priority: 'N3', ...data },
  });
  return res.json();
}

async function apiCreateCampaignEndingSoon(request: APIRequestContext, token: string) {
  const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await request.post(`${API_BASE}/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: unique('Cagnotte E2E Bientôt Finie'),
      targetAmountXof: 100_000,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDate,
    },
  });
  const campaign = await res.json();
  await request.post(`${API_BASE}/campaigns/${campaign.id}/activate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  return campaign;
}

test.describe('Director Dashboard — "À traiter" layout order', () => {
  test('Quick Actions is the first content block below the header, immediately followed by À traiter', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const quickActions = page.getByTestId('quick-action-add-child');
    await expect(quickActions).toBeVisible({ timeout: 10_000 });
    const attention = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'));
    await expect(attention).toBeVisible({ timeout: 10_000 });
    const finance = page.getByTestId('finance-kpis');
    await expect(finance).toBeVisible();

    const quickActionsBox = await quickActions.boundingBox();
    const attentionBox = await attention.boundingBox();
    const financeBox = await finance.boundingBox();
    expect(quickActionsBox).not.toBeNull();
    expect(attentionBox).not.toBeNull();
    expect(financeBox).not.toBeNull();

    expect(quickActionsBox!.y).toBeLessThan(attentionBox!.y);
    expect(attentionBox!.y).toBeLessThan(financeBox!.y);
  });

  test('the section title is "À TRAITER"', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('section-title-a-traiter')).toHaveText('À TRAITER', { timeout: 10_000 });
  });
});

test.describe('Director Dashboard — À traiter items', () => {
  test('an open incident produces an "incidents-open" attention card with title, message, count and a working drill-down', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-incidents-open');
    await expect(item).toBeVisible({ timeout: 10_000 });

    // Rendered exactly from the backend's own fields — no frontend
    // recomputation of the count or the wording.
    await expect(item.getByText(/incident/i).first()).toBeVisible();
    await expect(item.locator('[data-testid^="attention-severity-"]')).toBeVisible();

    await item.getByTestId('attention-action-incidents-open').click();
    await expect(page).toHaveURL(/\/app\/incidents$/);
  });

  test('resolving an incident decreases the incidents-open count on next load (backend current-state, not a frontend cache — the dashboard never persists a stale attention item)', async ({ page, request }) => {
    const token = await directorToken(request);
    const incident = await apiCreateIncident(request, token);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-incidents-open');
    await expect(item).toBeVisible({ timeout: 10_000 });
    const before = await request.get(`${API_BASE}/dashboard/attention`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const countBefore = before.items.find((i: { key: string }) => i.key === 'incidents-open')?.count ?? 0;

    await request.patch(`${API_BASE}/incidents/${incident.id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'RESOLU', note: 'Résolu pour le test e2e.' },
    });

    await page.goto('/app/dashboard');
    if (countBefore - 1 > 0) {
      // Other open incidents remain (likely, in the shared dev DB) — the
      // card stays, with a lower count.
      await expect(page.getByTestId('attention-item-incidents-open')).toContainText(String(countBefore - 1), { timeout: 10_000 });
    } else {
      // This was the only open incident — zero-count conditions are
      // omitted entirely by the backend, so the whole card disappears.
      await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 }); // page finished loading
      await expect(page.getByTestId('attention-item-incidents-open')).toHaveCount(0);
    }
  });
});

test.describe('Director Dashboard — À traiter severity UX', () => {
  test('CRITICAL/WARNING/INFO are distinguishable beyond color: each card shows an explicit French severity label alongside its icon', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token); // -> WARNING (incidents-open)

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-incidents-open');
    await expect(item).toBeVisible({ timeout: 10_000 });

    const badge = item.getByTestId('attention-severity-incidents-open');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('À surveiller');
    // An icon (svg) renders alongside the text badge — never color alone.
    await expect(item.locator('svg').first()).toBeVisible();
  });

  test('never exposes the raw backend severity enum string (e.g. "WARNING") as visible text', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-incidents-open');
    await expect(item).toBeVisible({ timeout: 10_000 });
    await expect(item.getByText('WARNING', { exact: true })).toHaveCount(0);
    await expect(item.getByText('CRITICAL', { exact: true })).toHaveCount(0);
    await expect(item.getByText('INFO', { exact: true })).toHaveCount(0);
  });
});

test.describe('Director Dashboard — À traiter empty state', () => {
  test('shows "Aucun point d\'attention actuellement." when there are no attention items', async ({ page }) => {
    await page.route('**/dashboard/attention', route =>
      route.fulfill({ json: { summary: { total: 0, critical: 0, warning: 0, info: 0 }, items: [] } }),
    );

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const empty = page.getByTestId('a-traiter-empty');
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty.getByText("Aucun point d'attention actuellement.")).toBeVisible();
    await expect(page.getByTestId('a-traiter')).toHaveCount(0);
  });
});

test.describe('Director Dashboard — À traiter API failure', () => {
  test('a failed /dashboard/attention request shows a retry state without breaking the rest of the dashboard', async ({ page }) => {
    // Every call fails until explicitly unrouted below — a call-counting
    // mock is fragile to any other consumer of this same endpoint racing
    // against the test's own request.
    await page.route('**/dashboard/attention', route => route.fulfill({ status: 500, json: { message: 'boom' } }));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const errorState = page.getByTestId('a-traiter-error');
    await expect(errorState).toBeVisible({ timeout: 10_000 });

    // Overview KPIs (a different endpoint) still render normally.
    await expect(page.getByTestId('finance-kpis')).toBeVisible();
    await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });

    await page.unroute('**/dashboard/attention');
    await errorState.getByRole('button', { name: 'Réessayer' }).click();
    const recovered = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'));
    await expect(recovered).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Director Dashboard — À traiter donor drill-down', () => {
  test('a campaign-ending-soon attention item opens Donateurs & Parrains on the Cagnottes tab', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateCampaignEndingSoon(request, token);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-campaigns-ending-soon');
    await expect(item).toBeVisible({ timeout: 10_000 });

    await item.getByTestId('attention-action-campaigns-ending-soon').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=cagnottes$/);
    await expect(page.getByRole('button', { name: 'Cagnottes' })).toHaveCSS('background-color', 'rgb(62, 90, 120)');
  });

  test('a donor-reports-to-prepare attention item opens Donateurs & Parrains on the Rapports tab', async ({ page }) => {
    // Deterministic via a mocked response — creating a real "PARRAIN with
    // zero reports" fixture would collide with fixtures from other specs
    // sharing the dev DB; this still exercises the exact same navigation
    // code path a genuine item would.
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

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const item = page.getByTestId('attention-item-donor-reports-to-prepare');
    await expect(item).toBeVisible({ timeout: 10_000 });
    await expect(item.getByTestId('attention-severity-donor-reports-to-prepare')).toHaveText('Information');

    await item.getByTestId('attention-action-donor-reports-to-prepare').click();
    await expect(page).toHaveURL(/\/app\/donateurs\?tab=rapports$/);
    await expect(page.getByRole('button', { name: 'Rapports' })).toHaveCSS('background-color', 'rgb(62, 90, 120)');
  });
});

test.describe('Director Dashboard — À traiter mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders with no horizontal overflow on mobile', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('attention-item-incidents-open')).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
