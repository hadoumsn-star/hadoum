import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector } from './helpers';

// Director Dashboard cleanup: "Activités à valider" and "Demandes RH" were
// removed first; this pass simplifies further — Recent Activity moved above
// Finance and filtered to rejected/pending expenses only, Finance cut down
// to the four budget KPIs, Quick Actions cut down to three, and the
// "EN ATTENTE" Pending Items section removed entirely. Values still come
// from existing, unmodified APIs (finances dashboard, DEPENSE transactions)
// — these tests verify the dashboard's client-side filtering matches what
// those same APIs report directly, never a new backend calculation.

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

// Approval can be budget-gated — fund the current month's SANTE category
// generously so a plain approve() in these tests isn't rejected for
// insufficient budget (same reasoning as expense-workflow.spec.ts's
// apiSetBudget default).
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
// The KPI card renders synchronously with a "—" placeholder before
// `listDailyPresence` resolves (`loadingPresence ? '—' : presenceSummary...`),
// so `getByTestId(...).toBeVisible()` is not enough to guarantee its number
// (or the modal's underlying data) is real — same reasoning as
// `waitForPresenceLoaded` in team-attendance-consistency.spec.ts. Every read
// and every click on this card, below, happens after this.
async function waitForPresenceKpiLoaded(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('kpi-presence-non-confirmed')).not.toContainText('—', { timeout: 10_000 });
}

async function readNonConfirmedKpi(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('kpi-presence-non-confirmed').locator('p').first().innerText();
  return parseInt(text.trim(), 10);
}

const REMOVED_KPI_TESTIDS = ['kpi-expenses-pending', 'kpi-expenses-approved', 'kpi-expenses-completed'];
const REMOVED_QUICK_ACTION_TESTIDS = [
  'quick-action-finances', 'quick-action-validations', 'quick-action-maintenance',
  'quick-action-demarches', 'quick-action-contrats',
];
const REMOVED_PENDING_ITEM_TESTIDS = ['pending-item-expenses', 'pending-item-maintenance', 'pending-item-procedures'];

test.describe('Director Dashboard — Finance cards', () => {
  test('shows exactly the four budget KPI cards, and none of the removed ones', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    for (const id of ['kpi-budget-total', 'kpi-budget-reserved', 'kpi-budget-consumed', 'kpi-budget-available']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('kpi-budget-total')).not.toContainText('—');

    for (const id of REMOVED_KPI_TESTIDS) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByTestId('finance-kpis').getByTestId(/^kpi-/)).toHaveCount(4);
  });

  test('Finance KPI values match the underlying finances data', async ({ page, request }) => {
    const token = await directorToken(request);
    const dashboard = await request.get(
      `${API_BASE}/finances/dashboard`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());

    const budgetTotal = dashboard.byCategory.reduce((s: number, c: { budgetXof: number | null }) => s + (c.budgetXof ?? 0), 0);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-budget-total')).toContainText(budgetTotal.toLocaleString('fr-FR'));
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

  test('"Ajouter un enfant" opens the add-child modal (route/behavior preserved)', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await page.getByTestId('quick-action-add-child').click();
    // Exact match — the dashboard's own "PRÉSENCE DES ENFANTS" section title
    // is also a heading and also matches a loose /enfant/i pattern, so this
    // has to be specific to the modal's own heading, not a partial match.
    await expect(page.getByRole('heading', { name: 'Ajouter un enfant', exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('"Saisir présences" and "Générer un rapport" navigate to the correct routes', async ({ page }) => {
    await loginAsDirector(page);

    await page.goto('/app/dashboard');
    // Team navigation update: staff presence now lives in Mon équipe's
    // "Présences" tab, not its own /app/attendance route.
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
  // Team navigation update: the new "Présence de l'équipe" section is
  // placed after Finance and before Activité récente, which also means
  // Finance now comes before Activité récente (reversed from the previous
  // pass) — order is: Finance → Présence de l'équipe → Activité récente.
  test('appears after the Finance and Présence de l\'équipe sections', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });

    const activityBox = await page.getByTestId('recent-activity').boundingBox();
    const financeBox = await page.getByTestId('finance-kpis').boundingBox();
    const presenceBox = await page.getByTestId('team-presence-kpis').boundingBox();
    expect(activityBox).not.toBeNull();
    expect(financeBox).not.toBeNull();
    expect(presenceBox).not.toBeNull();
    expect(financeBox!.y).toBeLessThan(presenceBox!.y);
    expect(presenceBox!.y).toBeLessThan(activityBox!.y);
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

    // Budget editing is SUPERVISOR-only — dToken would 403 here.
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

    // The verb and the label render in the same paragraph ("Dépense
    // refusée — <label>"), so asserting on the combined text both proves
    // the verb is correct AND scopes to this test's own unique row —
    // avoiding ambiguity with other rejected/pending rows already present
    // in the shared dev database from other e2e runs.
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

// "Non confirmées" KPI → modal (Director Dashboard attendance section
// improvement). The modal's list must always come from the exact same
// `presence` object/predicate the KPI count itself is built from
// (`nonConfirmedEligibleEntries`, team.api.ts) — never a second query — so
// these tests assert the row count against the KPI's own displayed number,
// not an independently-fetched value.
test.describe('Director Dashboard — "Non confirmées" modal', () => {
  test('opens on click; row count and title match the KPI count exactly', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalCount');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForPresenceKpiLoaded(page);
    const kpiCount = await readNonConfirmedKpi(page);
    expect(kpiCount).toBeGreaterThan(0);

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('non-confirmed-modal-title')).toHaveText(`Présences non confirmées (${kpiCount})`);
    await expect(modal.getByTestId(/^non-confirmed-row-/)).toHaveCount(kpiCount);

    // Fixture person appears with name, job title (role) and the "Non
    // confirmée" status badge.
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
    await waitForPresenceKpiLoaded(page);
    const kpiCount = await readNonConfirmedKpi(page);

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId(/^non-confirmed-row-/)).toHaveCount(kpiCount);
    await expect(modal.getByText(onLeaveName)).toHaveCount(0);
    await expect(modal.getByText(eligibleName)).toBeVisible();
  });

  test('"Confirmer" navigates to Mon équipe → Présences with the person searched and ready to confirm, without confirming anything itself', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalNav');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForPresenceKpiLoaded(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    const row = modal.getByTestId(/^non-confirmed-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Confirmer' }).click();

    // Modal is gone, dashboard left behind — this is a real navigation, not
    // an in-place confirm.
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance&status=NON_CONFIRMED&search=/);
    await expect(page.getByTestId('non-confirmed-modal')).toHaveCount(0);

    // Today's date is selected (the tab's own default) and the person is
    // pre-searched into view, with the confirm buttons ready.
    await expect(page.getByLabel('Date des présences')).toHaveValue(new Date().toISOString().slice(0, 10));
    const teamRow = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(teamRow).toBeVisible({ timeout: 10_000 });
    await expect(teamRow.getByRole('button', { name: 'Présent' })).toBeVisible();
    await expect(teamRow.getByRole('button', { name: 'Absent' })).toBeVisible();
    // Confirmed nothing — this person is still Non confirmée.
    await expect(teamRow.getByText('Non confirmée')).toBeVisible();
  });

  test('empty state: "Aucune présence en attente de confirmation." when there is nothing pending', async ({ page }) => {
    // Forces the branch deterministically via a mocked response — the
    // shared dev DB accumulates fixture staff across every other e2e spec
    // in this repo, so a real zero can't be relied on; this still exercises
    // the exact same component code path a genuine zero would.
    await page.route('**/staff/presence*', route =>
      route.fulfill({ json: { date: new Date().toISOString().slice(0, 10), entries: [], nonConfirmedCount: 0 } }),
    );

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('kpi-presence-non-confirmed')).toContainText('0', { timeout: 10_000 });

    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('non-confirmed-modal-title')).toHaveText('Présences non confirmées (0)');
    await expect(modal.getByText('Aucune présence en attente de confirmation.')).toBeVisible();
    await expect(modal.getByTestId(/^non-confirmed-row-/)).toHaveCount(0);
  });

  test('refreshes automatically: confirming a person elsewhere, then returning to the dashboard, updates the KPI and the modal', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DashModalRefresh');
    const staff = await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForPresenceKpiLoaded(page);
    const kpiBefore = await readNonConfirmedKpi(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    await expect(page.getByTestId('non-confirmed-modal').getByText(firstName)).toBeVisible();
    await page.getByTestId('non-confirmed-modal').getByRole('button', { name: 'Fermer' }).click();

    // Confirmed through the real workflow (a fresh API call, same as the
    // team page's own Présent button would trigger) — not a dashboard
    // shortcut, matching "do not perform the confirmation from the
    // dashboard."
    await apiConfirmPresence(request, token, staff.id, 'PRESENT');

    // A full navigation away and back remounts the dashboard, which is what
    // re-fetches `listDailyPresence` — same convention as the "Présences"
    // tab's own refresh-on-remount behavior.
    await page.goto('/app/team');
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('team-presence-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-presence-non-confirmed').locator('p').first())
      .toHaveText(String(kpiBefore - 1), { timeout: 10_000 });

    await page.getByTestId('kpi-presence-non-confirmed').click();
    await expect(page.getByTestId('non-confirmed-modal')).toBeVisible();
    await expect(page.getByTestId('non-confirmed-modal').getByText(firstName)).toHaveCount(0);
    await expect(page.getByTestId('non-confirmed-modal').getByTestId(/^non-confirmed-row-/)).toHaveCount(kpiBefore - 1);
  });

  test('disabled while presence is still loading: the KPI card does not open a stale modal', async ({ page }) => {
    // Slow the presence response so the loading window is observable.
    await page.route('**/staff/presence*', async route => {
      await new Promise(r => setTimeout(r, 1000));
      await route.continue();
    });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const card = page.getByTestId('kpi-presence-non-confirmed');
    await expect(card).toBeVisible();
    await expect(card).toContainText('—');
    await card.click();
    await expect(page.getByTestId('non-confirmed-modal')).toHaveCount(0);

    await expect(card).not.toContainText('—', { timeout: 10_000 });
    await card.click();
    await expect(page.getByTestId('non-confirmed-modal')).toBeVisible();
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
    await waitForPresenceKpiLoaded(page);
    await page.getByTestId('kpi-presence-non-confirmed').click();
    const modal = page.getByTestId('non-confirmed-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(firstName)).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const row = modal.getByTestId(/^non-confirmed-row-/).filter({ hasText: firstName });
    await expect(row.getByRole('button', { name: 'Confirmer' })).toBeVisible();
  });
});
