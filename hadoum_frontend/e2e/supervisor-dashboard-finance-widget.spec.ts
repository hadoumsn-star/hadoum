import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsSupervisor } from './helpers';

// Supervisor Dashboard "Vue d'ensemble" used to carry a *separate*
// <PendingExpenseApprovals /> "Dépenses à valider" widget alongside its own
// generic "Demandes à valider" list (which explicitly excluded expenses to
// avoid showing them twice). Supervisor validation consistency merged the
// two: expenses now render as regular cards inside the one
// <PendingValidationsList variant="card" /> the dashboard renders — the
// exact same expense rendering (budget summary, ExpenseDecisionModal,
// mandatory reject comment) that widget always had, just inside the single
// unified list instead of a second section with its own heading. See
// PendingValidationsList.tsx and supervisor-validation-consistency.spec.ts
// for the full mixed-resource-type coverage; this file keeps the
// expense-specific assertions (budget summary, decision modal, mobile) that
// lived here before the merge.
//
// A category+period pair not used by any other spec file (TRANSPORT,
// 2032-03) keeps this file's budget assertions isolated from
// expense-workflow.spec.ts (SANTE/EQUIPEMENT, 2031-06).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';
const BUDGET_YEAR = 2032;
const BUDGET_MONTH = 3;
const BUDGET_DATE = `${BUDGET_YEAR}-0${BUDGET_MONTH}-15`;
const CATEGORY = 'TRANSPORT';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}

async function directorToken(request: APIRequestContext): Promise<string> {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}

async function supervisorToken(request: APIRequestContext): Promise<string> {
  return apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
}

async function apiCreateExpense(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/finances/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: 'DEPENSE',
      category: CATEGORY,
      label: unique('Dépense Dashboard E2E'),
      amountXof: 15000,
      date: BUDGET_DATE,
      ...data,
    },
  });
  return res.json();
}

async function apiSetBudget(request: APIRequestContext, token: string, budgetXof: number) {
  await request.put(`${API_BASE}/finances/budget-lines`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { category: CATEGORY, month: BUDGET_MONTH, year: BUDGET_YEAR, budgetXof },
  });
}

async function apiSubmit(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/submit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
}

// The merged list uses <li> rows (variant="card") — same xpath-ancestor
// technique expense-workflow.spec.ts already uses to scope assertions to
// one pending item's own card.
function pendingCard(page: Page, label: string) {
  return page.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
}

test.describe('Supervisor Dashboard — expense cards inside the unified "Demandes à valider" list', () => {
  test.beforeAll(async ({ request }) => {
    // Budget editing is SUPERVISOR-only — directorToken would 403 here.
    const token = await supervisorToken(request);
    await apiSetBudget(request, token, 5_000_000); // generous default
  });

  test('a pending expense renders with title, badge, budget summary, Approuver/Refuser — inside the one list, not a second section', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Widget Dashboard E2E');
    const created = await apiCreateExpense(request, token, { label });
    await apiSubmit(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');

    const dashboard = page.getByTestId('supervisor-dashboard');
    // Exactly one "Demandes à valider" heading — the widget and the generic
    // list were merged into one, so there is nothing left to duplicate.
    await expect(dashboard.getByText('Demandes à valider')).toHaveCount(1);
    const card = pendingCard(page, label);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('DÉPENSE')).toBeVisible();
    await expect(card.getByText('BUDGET TRANSPORT')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Approuver' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Refuser' })).toBeVisible();
  });

  test('Approuver works from the Supervisor Dashboard and the item disappears on its own (automatic refresh)', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Approbation Dashboard E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText('Demandes à valider')).toBeVisible({ timeout: 10_000 });

    const card = pendingCard(page, label);
    await card.getByRole('button', { name: 'Approuver' }).click();
    const modal = page.getByTestId('expense-decision-modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByText('Dépense approuvée.')).toBeVisible({ timeout: 10_000 });

    // No manual reload — the list's own reload() removed it.
    await expect(dashboard.getByText(label)).toHaveCount(0);
  });

  test('Refuser requires a mandatory comment and works from the Supervisor Dashboard', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Refus Dashboard E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const card = pendingCard(page, label);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Refuser' }).click();

    const modal = page.getByTestId('expense-decision-modal');
    await expect(modal).toBeVisible();
    const confirmButton = modal.getByRole('button', { name: 'Refuser' });
    await expect(confirmButton).toBeDisabled();

    await modal.getByPlaceholder('Expliquez votre décision…').fill('Justificatif manquant');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(page.getByText('Dépense refusée.')).toBeVisible({ timeout: 10_000 });

    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText(label)).toHaveCount(0);
  });

  test('a full SPA round trip re-fetches the list (navigating away and back)', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Refresh Dashboard E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('supervisor-dashboard').getByText(label)).toBeVisible({ timeout: 10_000 });

    await page.goto('/app/incidents');
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('supervisor-dashboard').getByText(label)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Supervisor Dashboard — expense card mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow with a pending expense card visible', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Mobile Dashboard E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('supervisor-dashboard').getByText(label)).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const card = pendingCard(page, label);
    await card.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByTestId('expense-decision-modal')).toBeVisible();
  });
});
