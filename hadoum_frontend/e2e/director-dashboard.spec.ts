import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector } from './helpers';

// Module 6 (PR 23): Director Dashboard migrated to the Module 6 aggregate
// endpoints (/dashboard/overview, /operations, /trends, /attention) as its
// source of truth. This file was previously built around four old,
// client-computed Finance KPI cards (Budget total/réservé/consommé/
// disponible, summed from /finances/dashboard's byCategory) — those are
// replaced by the two approved canonical figures (Budget Total, Budget
// Restant, straight from /dashboard/overview.finance) plus one renamed
// legacy figure (Budget alloué, still the old allocated-category sum —
// see DirectorDashboard.tsx's own comment on why it's kept, correctly
// labeled, rather than removed). Quick Actions, the "Non confirmées"
// staff-attendance modal, and Recent Activity are unaffected by Module 6
// and keep their existing behavior/testids — only the modal's data-loading
// now happens lazily on open rather than eagerly on page load (see
// director-dashboard.spec.ts's own "Non confirmées" section below).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}
function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}
function supervisorToken(request: APIRequestContext) {
  return apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
}

async function apiCreateExpense(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/finances/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: 'DEPENSE',
      category: 'SANTE',
      label: unique('Dépense Dashboard E2E'),
      amountXof: 15000,
      date: new Date().toISOString().slice(0, 10),
      ...data,
    },
  });
  return res.json();
}
async function apiSubmit(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/submit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
}
async function apiReject(request: APIRequestContext, token: string, id: string, comment = 'Montant à revoir') {
  await request.post(`${API_BASE}/finances/transactions/${id}/reject`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { comment },
  });
}
async function apiApprove(request: APIRequestContext, token: string, id: string) {
  const res = await request.post(`${API_BASE}/finances/transactions/${id}/approve`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  if (!res.ok()) throw new Error(`approve failed: ${res.status()} ${await res.text()}`);
  return res.json();
}
async function apiFundCurrentMonth(request: APIRequestContext, token: string, category = 'SANTE') {
  const now = new Date();
  await request.put(`${API_BASE}/finances/budget-lines`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { category, month: now.getMonth() + 1, year: now.getFullYear(), budgetXof: 5_000_000 },
  });
}

async function apiCreateStaff(request: APIRequestContext, token: string, firstName: string) {
  const res = await request.post(`${API_BASE}/staff`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { firstName, lastName: 'E2E', role: 'Éducateur' },
  });
  return res.json();
}
async function apiCreateLeave(request: APIRequestContext, token: string, staffId: string, type: 'conge' | 'absence', dateDebut: string) {
  await request.post(`${API_BASE}/staff/${staffId}/attendance`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type, dateDebut },
  });
}
async function apiConfirmPresence(request: APIRequestContext, token: string, staffId: string, status: 'PRESENT' | 'ABSENT') {
  await request.post(`${API_BASE}/staff/${staffId}/presence`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { date: new Date().toISOString().slice(0, 10), status },
  });
}

// The Personnel KPI cards render synchronously with a "—" placeholder
// before /dashboard/overview resolves — same reasoning as
// waitForPresenceKpiLoaded before PR 23, just against the new aggregate.
async function waitForOverviewLoaded(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('kpi-presence-non-confirmed')).not.toContainText('—', { timeout: 10_000 });
}

async function readNonConfirmedKpi(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('kpi-presence-non-confirmed').locator('p').first().innerText();
  return parseInt(text.trim(), 10);
}

const REMOVED_KPI_TESTIDS = ['kpi-expenses-pending', 'kpi-expenses-approved', 'kpi-expenses-completed', 'kpi-budget-reserved', 'kpi-budget-consumed', 'kpi-budget-available'];
const REMOVED_QUICK_ACTION_TESTIDS = [
  'quick-action-finances', 'quick-action-validations', 'quick-action-maintenance',
  'quick-action-demarches', 'quick-action-contrats',
];
const REMOVED_PENDING_ITEM_TESTIDS = ['pending-item-expenses', 'pending-item-maintenance', 'pending-item-procedures'];

test.describe('Director Dashboard — Finance cards (Module 6)', () => {
  test('shows exactly Budget Total, Budget Restant and Budget alloué, and none of the removed cards', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    for (const id of ['kpi-budget-total', 'kpi-budget-restant', 'kpi-budget-alloue']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—', { timeout: 10_000 });

    for (const id of REMOVED_KPI_TESTIDS) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByTestId('finance-kpis').getByTestId(/^kpi-/)).toHaveCount(3);

    // "Budget Total" and "Budget alloué" are two distinct concepts, never
    // the same label — the whole point of PR 23's terminology correction.
    await expect(page.getByTestId('kpi-budget-total').getByText('Budget Total', { exact: true })).toBeVisible();
    await expect(page.getByTestId('kpi-budget-alloue').getByText('Budget alloué', { exact: true })).toBeVisible();
    await expect(page.getByTestId('kpi-budget-total').getByText('Budget alloué')).toHaveCount(0);
  });

  test('Budget Total / Budget Restant match /dashboard/overview exactly, never client-recomputed', async ({ page, request }) => {
    const token = await directorToken(request);
    const overview = await request.get(
      `${API_BASE}/dashboard/overview`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-budget-total')).toContainText(
      overview.finance.budgetTotalXof.toLocaleString('fr-FR'), { timeout: 10_000 },
    );
    await expect(page.getByTestId('kpi-budget-restant')).toContainText(
      overview.finance.budgetRestantXof.toLocaleString('fr-FR'),
    );
  });

  test('Budget alloué matches the sum of allocated category budgets from /finances/dashboard', async ({ page, request }) => {
    const token = await directorToken(request);
    const dashboard = await request.get(
      `${API_BASE}/finances/dashboard`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    const budgetAlloue = dashboard.byCategory.reduce((s: number, c: { budgetXof: number | null }) => s + (c.budgetXof ?? 0), 0);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('kpi-budget-alloue')).toContainText(budgetAlloue.toLocaleString('fr-FR'), { timeout: 10_000 });
  });
});

test.describe('Director Dashboard — Quick Actions', () => {
  test('shows exactly the three retained shortcuts, and none of the removed ones', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    for (const id of ['quick-action-add-child', 'quick-action-attendance', 'quick-action-reports']) {
      await expect(page.getByTestId(id)).toBeVisible({ timeout: 10_000 });
    }
    for (const id of REMOVED_QUICK_ACTION_TESTIDS) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByTestId(/^quick-action-/)).toHaveCount(3);
  });

  test('Quick Actions is the first content block below the header', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const quickActions = page.getByTestId('quick-action-add-child');
    await expect(quickActions).toBeVisible({ timeout: 10_000 });
    const attention = page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty')).or(page.getByTestId('a-traiter-loading'));
    await expect(attention).toBeVisible({ timeout: 10_000 });

    const quickActionsBox = await quickActions.boundingBox();
    const attentionBox = await attention.boundingBox();
    expect(quickActionsBox).not.toBeNull();
    expect(attentionBox).not.toBeNull();
    expect(quickActionsBox!.y).toBeLessThan(attentionBox!.y);
  });

  test('"Ajouter un enfant" opens the add-child modal (route/behavior preserved)', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await page.getByTestId('quick-action-add-child').click();
    await expect(page.getByRole('heading', { name: 'Ajouter un enfant', exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('"Saisir présences" and "Générer un rapport" navigate to the correct routes', async ({ page }) => {
    await loginAsDirector(page);

    await page.goto('/app/dashboard');
    await page.getByTestId('quick-action-attendance').click();
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance$/);

    await page.goto('/app/dashboard');
    await page.getByTestId('quick-action-reports').click();
    await expect(page).toHaveURL(/\/app\/reports$/);
  });
});

test.describe('Director Dashboard — Pending Items section removed', () => {
  test('no "EN ATTENTE" pending-item cards remain on the dashboard', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });

    for (const id of REMOVED_PENDING_ITEM_TESTIDS) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByText('EN ATTENTE', { exact: true })).toHaveCount(0);
  });
});

test.describe('Director Dashboard — Recent Activity', () => {
  test('appears after the Finance and Situation aujourd\'hui — Personnel sections', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    // À traiter (above these sections) resolves asynchronously and can
    // still be expanding — settle it first or the boundingBox() reads
    // below can race it into a false ordering.
    await expect(page.getByTestId('a-traiter').or(page.getByTestId('a-traiter-empty'))).toBeVisible({ timeout: 10_000 });

    const activityBox = await page.getByTestId('recent-activity').boundingBox();
    const financeBox = await page.getByTestId('finance-kpis').boundingBox();
    const presenceBox = await page.getByTestId('team-presence-kpis').boundingBox();
    expect(activityBox).not.toBeNull();
    expect(financeBox).not.toBeNull();
    expect(presenceBox).not.toBeNull();
    expect(presenceBox!.y).toBeLessThan(financeBox!.y);
    expect(financeBox!.y).toBeLessThan(activityBox!.y);
  });

  test('shows a rejected expense and a pending expense, but not an approved one', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);

    const rejectedLabel = unique('Refusée Dashboard');
    const rejected = await apiCreateExpense(request, dToken, { label: rejectedLabel });
    await apiSubmit(request, dToken, rejected.id);
    await apiReject(request, sToken, rejected.id);

    const pendingLabel = unique('En attente Dashboard');
    const pending = await apiCreateExpense(request, dToken, { label: pendingLabel });
    await apiSubmit(request, dToken, pending.id);

    await apiFundCurrentMonth(request, sToken);
    const approvedLabel = unique('Approuvée Dashboard');
    const approved = await apiCreateExpense(request, dToken, { label: approvedLabel });
    await apiSubmit(request, dToken, approved.id);
    const approvedResult = await apiApprove(request, sToken, approved.id);
    expect(approvedResult.expenseWorkflowStatus).toBe('APPROVED');

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const activity = page.getByTestId('recent-activity');
    await expect(activity).toBeVisible({ timeout: 10_000 });

    await expect(activity.getByText(`Dépense refusée — ${rejectedLabel}`)).toBeVisible({ timeout: 10_000 });
    await expect(activity.getByText(`En attente — ${pendingLabel}`)).toBeVisible();
    await expect(activity.getByText(approvedLabel)).toHaveCount(0);
  });

  test('clicking an activity row navigates to Finances', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    const label = unique('Clic Dashboard');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);
    await apiReject(request, sToken, created.id);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const activity = page.getByTestId('recent-activity');
    await expect(activity.getByText(label)).toBeVisible({ timeout: 10_000 });

    await activity.getByText(label).click();
    await expect(page).toHaveURL(/\/app\/finances$/);
  });
});

// "Non confirmées" KPI → modal. Module 6 (PR 23): the KPI count now comes
// from /dashboard/overview (aggregate, no PII on page load); the modal's
// own name list is fetched lazily, only once the director actually opens
// it — never eagerly. These tests assert the modal's own row count/title
// against itself (its own fresh fetch), which in the normal case (no
// concurrent change between page load and modal open) still equals the
// overview's own nonConfirmedToday count.
test.describe('Director Dashboard — "Non confirmées" modal', () => {
  test('opens on click; shows its own loading state, then the real row list', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalCount');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    const kpiCount = await readNonConfirmedKpi(page);
    expect(kpiCount).toBeGreaterThan(0);

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    // Own internal loading state — no count shown yet at this instant, but
    // it never crashes/blanks the page.
    await expect(page.getByTestId('non-confirmed-modal-title')).toBeVisible();

    await expect(page.getByTestId('non-confirmed-modal-title')).toHaveText(`Présences non confirmées (${kpiCount})`, { timeout: 10_000 });
    await expect(modal.getByTestId(/^non-confirmed-row-/)).toHaveCount(kpiCount);

    const row = modal.getByTestId(/^non-confirmed-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible();
    await expect(row.getByText('Éducateur')).toBeVisible();
    await expect(row.getByText('Non confirmée')).toBeVisible();
  });

  test('staff currently on Congé/Absence never appear in the modal list', async ({ page, request }) => {
    const token = await directorToken(request);
    const onLeaveName = unique('DashModalLeave');
    const staffOnLeave = await apiCreateStaff(request, token, onLeaveName);
    await apiCreateLeave(request, token, staffOnLeave.id, 'conge', new Date().toISOString().slice(0, 10));
    const eligibleName = unique('DashModalEligible');
    await apiCreateStaff(request, token, eligibleName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(eligibleName)).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText(onLeaveName)).toHaveCount(0);
  });

  test('"Confirmer" navigates to Mon équipe → Présences with the person searched and ready to confirm, without confirming anything itself', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalNav');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    const row = modal.getByTestId(/^non-confirmed-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page).toHaveURL(/\/app\/team\?tab=attendance&status=NON_CONFIRMED&search=/);
    await expect(page.getByTestId('non-confirmed-modal')).toHaveCount(0);

    await expect(page.getByLabel('Date des présences')).toHaveValue(new Date().toISOString().slice(0, 10));
    const teamRow = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(teamRow).toBeVisible({ timeout: 10_000 });
    await expect(teamRow.getByRole('button', { name: 'Présent' })).toBeVisible();
    await expect(teamRow.getByRole('button', { name: 'Absent' })).toBeVisible();
    await expect(teamRow.getByText('Non confirmée')).toBeVisible();
  });

  test('empty state: "Aucune présence en attente de confirmation." when there is nothing pending', async ({ page }) => {
    // The KPI card's own number now comes from /dashboard/overview (Module
    // 6) — real response, with just staff.nonConfirmedToday forced to 0 —
    // while the modal's own lazy fetch (still /staff/presence) is mocked
    // to return zero entries, so the two stay internally consistent.
    await page.route('**/dashboard/overview**', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.staff.nonConfirmedToday = 0;
      await route.fulfill({ response, json: body });
    });
    await page.route('**/staff/presence*', route =>
      route.fulfill({ json: { date: new Date().toISOString().slice(0, 10), entries: [], nonConfirmedCount: 0 } }),
    );

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('kpi-presence-non-confirmed')).toContainText('0', { timeout: 10_000 });

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('non-confirmed-modal-title')).toHaveText('Présences non confirmées (0)', { timeout: 10_000 });
    await expect(modal.getByText('Aucune présence en attente de confirmation.')).toBeVisible();
    await expect(modal.getByTestId(/^non-confirmed-row-/)).toHaveCount(0);
  });

  test('refreshes automatically: confirming a person elsewhere, then returning to the dashboard, updates the KPI and the modal', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalRefresh');
    const staff = await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    const kpiBefore = await readNonConfirmedKpi(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    await expect(page.getByTestId('non-confirmed-modal').getByText(firstName)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('non-confirmed-modal').getByRole('button', { name: 'Fermer' }).click();

    await apiConfirmPresence(request, token, staff.id, 'PRESENT');

    await page.goto('/app/team');
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('team-presence-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-presence-non-confirmed').locator('p').first())
      .toHaveText(String(kpiBefore - 1), { timeout: 10_000 });

    await page.getByTestId('kpi-presence-non-confirmed').click();
    await expect(page.getByTestId('non-confirmed-modal')).toBeVisible();
    await expect(page.getByTestId('non-confirmed-modal').getByTestId(/^non-confirmed-row-/)).toHaveCount(kpiBefore - 1, { timeout: 10_000 });
    await expect(page.getByTestId('non-confirmed-modal').getByText(firstName)).toHaveCount(0);
  });
});

test.describe('Director Dashboard — mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Recent Activity, Finance KPIs, Présence de l\'équipe and Quick Actions render with no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('recent-activity')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finance-kpis')).toBeVisible();
    await expect(page.getByTestId('team-presence-kpis')).toBeVisible();
    await expect(page.getByTestId('quick-action-add-child')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('the "Non confirmées" modal is usable with no horizontal overflow on mobile', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalMobile');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForOverviewLoaded(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(firstName)).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const row = modal.getByTestId(/^non-confirmed-row-/).filter({ hasText: firstName });
    await expect(row.getByRole('button', { name: 'Confirmer' })).toBeVisible();
  });
});
