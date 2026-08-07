import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// The generic "Demandes à valider" page (/app/validations), wired to the
// real GET /validations/pending + history endpoints. This file keeps the
// original expense-specific coverage (still the exact same
// ExpenseDecisionModal/budget-summary path); see
// supervisor-validation-consistency.spec.ts for Approve/Reject coverage on
// the other resource types (Supplier Contract, Administrative Procedure,
// Maintenance Ticket, …) now also wired generically on this same page —
// not reimplemented per module, dispatched to each resource's own existing
// approve/reject endpoint.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';
const BUDGET_YEAR = 2032;
const BUDGET_MONTH = 3;
const BUDGET_DATE = `${BUDGET_YEAR}-0${BUDGET_MONTH}-10`;

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
      category: 'PEDAGOGIE',
      label: unique('Dépense ValidationsPage'),
      amountXof: 15000,
      date: BUDGET_DATE,
      ...data,
    },
  });
  return res.json();
}

async function apiSetBudget(request: APIRequestContext, token: string, budgetXof: number, category = 'PEDAGOGIE') {
  await request.put(`${API_BASE}/finances/budget-lines`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { category, month: BUDGET_MONTH, year: BUDGET_YEAR, budgetXof },
  });
}

async function apiSubmit(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/submit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
}

function pendingCard(page: import('@playwright/test').Page, label: string) {
  return page.locator(`xpath=//p[text()="${label}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
}

test.describe('Validations page — real expense workflow (PR 5F)', () => {
  test.beforeAll(async ({ request }) => {
    // Budget editing is SUPERVISOR-only — directorToken would 403 here.
    const token = await supervisorToken(request);
    await apiSetBudget(request, token, 5_000_000);
  });

  test('SUPERVISOR approves a pending expense from the Validations page', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Approbation ValidationsPage');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCard(page, label);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('BUDGET PÉDAGOGIE')).toBeVisible();
    await expect(card.getByText('EN ATTENTE DE VALIDATION')).toBeVisible();

    await card.getByRole('button', { name: 'Approuver' }).click();
    const modal = page.getByTestId('expense-decision-modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Approuver' }).click();

    await expect(page.getByText('Dépense approuvée.')).toBeVisible({ timeout: 10_000 });
    // Auto-refresh: the now-decided item is no longer PENDING_VALIDATION,
    // so it must disappear from the list without a manual reload.
    await expect(pendingCard(page, label)).toHaveCount(0);
  });

  test('SUPERVISOR rejects a pending expense; comment is mandatory', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Refus ValidationsPage');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
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
    await expect(pendingCard(page, label)).toHaveCount(0);
  });

  test('history opens and shows the submission', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Historique ValidationsPage');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCard(page, label);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.locator('button[title="Historique de validation"]').click();

    const historyModal = page.getByTestId('validation-history-modal');
    await expect(historyModal).toBeVisible();
    await expect(historyModal.getByText(label)).toBeVisible();
    await expect(historyModal.getByText('EN ATTENTE DE VALIDATION')).toBeVisible();
    await expect(historyModal.getByText('Soumis par Hadoum Director')).toBeVisible();
  });

  test('DIRECTOR sees the same pending expense read-only: no Approuver/Refuser buttons', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Lecture seule ValidationsPage');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsDirector(page);
    await page.goto('/app/validations');
    const card = pendingCard(page, label);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
    // History stays available in read-only mode.
    await expect(card.locator('button[title="Historique de validation"]')).toBeVisible();
  });

  test('other resource types still appear in the same real list', async ({ page, request }) => {
    // A deterministic fixture rather than relying on ambient dev-DB state
    // left over from other suites (PENDING_VALIDATION is transient — once
    // any earlier run decides a pending ticket, there may be none left).
    const token = await directorToken(request);
    const spaces = await request.get(`${API_BASE}/spaces`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    const title = unique('Ticket ValidationsPage');
    const created = await request.post(`${API_BASE}/maintenance-tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title, spaceId: spaces[0].id, urgency: 'MOYENNE', reportedBy: 'Test Director' },
    }).then(r => r.json());
    await request.post(`${API_BASE}/maintenance-tickets/${created.id}/submit-validation`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    });

    await loginAsDirector(page);
    await page.goto('/app/validations');
    // Asserts the generic list still renders this resource type without
    // crashing, adaptively (title + badge) — its own decision flow is
    // covered in supervisor-validation-consistency.spec.ts.
    await expect(page.getByText('TICKET DE MAINTENANCE').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible();
  });
});
