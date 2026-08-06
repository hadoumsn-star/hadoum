import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 5E: Expense workflow frontend. Drives the real Finance page against the
// real backend, with genuinely separate DIRECTOR/SUPERVISOR sessions for the
// two-actor scenarios — same convention as validation.spec.ts and
// finances.spec.ts (PR 4). A dedicated category (SANTE) and a far-future
// month/year are used for the budget-sensitive tests so they don't collide
// with other fixture data already in the shared dev database.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';
const BUDGET_YEAR = 2031;
const BUDGET_MONTH = 6;
const BUDGET_DATE = `${BUDGET_YEAR}-0${BUDGET_MONTH}-15`;

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
      category: 'SANTE',
      label: unique('Dépense E2E'),
      amountXof: 20000,
      date: BUDGET_DATE,
      ...data,
    },
  });
  return res.json();
}

async function apiSetBudget(request: APIRequestContext, token: string, budgetXof: number, category = 'SANTE') {
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

async function apiApprove(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/approve`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
}

async function apiUploadInvoice(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') } },
  });
}

// Finds the transaction row (the surrounding card) by its unique label text,
// scoped to the flat transaction <ul> — same xpath-ancestor technique
// validation.spec.ts already uses for a differently-shaped list.
function transactionRow(page: import('@playwright/test').Page, label: string) {
  return page.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
}

test.describe('Expense workflow (PR 5E)', () => {
  test.beforeAll(async ({ request }) => {
    // Budget editing is SUPERVISOR-only — directorToken would 403 here.
    const token = await supervisorToken(request);
    await apiSetBudget(request, token, 5_000_000); // generous default for most tests
  });

  test('DIRECTOR submits a DEPENSE and sees it move to "en attente de validation"', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Soumission E2E');
    const created = await apiCreateExpense(request, token, { label });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.waitForLoadState('networkidle');
    const row = transactionRow(page, label);
    await row.getByRole('button', { name: 'Soumettre' }).click();

    const submitModal = page.getByTestId('expense-decision-modal');
    await expect(submitModal).toBeVisible();
    await expect(submitModal.getByText('BUDGET SANTÉ')).toBeVisible({ timeout: 15_000 });
    await submitModal.getByRole('button', { name: 'Soumettre' }).click();

    await expect(page.getByText('Dépense soumise pour validation.')).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('EN ATTENTE DE VALIDATION')).toBeVisible();
    await expect(page.getByText('Demandes à valider')).toBeVisible();
    void created;
  });

  test('SUPERVISOR sees the pending request, approves it, and DIRECTOR sees APPROUVÉE', async ({ browser, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Approbation E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    const supervisorContext = await browser.newContext();
    const supervisorPage = await supervisorContext.newPage();
    await loginAsSupervisor(supervisorPage);
    await supervisorPage.goto('/app/finances');

    await expect(supervisorPage.getByText('Demandes à valider')).toBeVisible();
    const pendingCard = supervisorPage.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
    await expect(pendingCard.getByText('BUDGET SANTÉ')).toBeVisible();
    await pendingCard.getByRole('button', { name: 'Approuver' }).click();
    await expect(supervisorPage.getByTestId('expense-decision-modal')).toBeVisible();
    await supervisorPage.getByTestId('expense-decision-modal').getByRole('button', { name: 'Approuver' }).click();
    await expect(supervisorPage.getByText('Dépense approuvée.')).toBeVisible({ timeout: 10_000 });

    const directorContext = await browser.newContext();
    const directorPage = await directorContext.newPage();
    await loginAsDirector(directorPage);
    await directorPage.goto('/app/finances');
    await expect(transactionRow(directorPage, label).getByText('APPROUVÉE')).toBeVisible({ timeout: 10_000 });

    await supervisorContext.close();
    await directorContext.close();
  });

  test('SUPERVISOR reject requires a mandatory comment', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Refus E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    const pendingCard = page.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
    await pendingCard.getByRole('button', { name: 'Refuser' }).click();

    const modal = page.getByTestId('expense-decision-modal');
    await expect(modal).toBeVisible();
    const confirmButton = modal.getByRole('button', { name: 'Refuser' });
    await expect(confirmButton).toBeDisabled();

    await modal.getByPlaceholder('Expliquez votre décision…').fill('Justificatif manquant');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(page.getByText('Dépense refusée.')).toBeVisible({ timeout: 10_000 });
  });

  test('DIRECTOR resubmits a rejected expense and history shows both cycles', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    const label = unique('Resoumission E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);
    await request.post(`${API_BASE}/finances/transactions/${created.id}/reject`, {
      headers: { Authorization: `Bearer ${sToken}` },
      data: { comment: 'Montant à vérifier' },
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const row = transactionRow(page, label);
    await expect(row.getByText('REFUSÉE')).toBeVisible();
    await row.getByRole('button', { name: 'Resoumettre' }).click();
    await page.getByTestId('expense-decision-modal').getByRole('button', { name: 'Resoumettre' }).click();
    await expect(page.getByText('Dépense resoumise pour validation.')).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('EN ATTENTE DE VALIDATION')).toBeVisible();

    // History: reuses GET /validations/EXPENSE_TRANSACTION/:id/history — both
    // the rejection and the fresh pending cycle must be visible.
    await row.locator('button[title="Historique de validation"]').click();
    const historyModal = page.getByTestId('validation-history-modal');
    await expect(historyModal).toBeVisible();
    await expect(historyModal.getByText('REFUSÉ')).toBeVisible();
    await expect(historyModal.getByText('Montant à vérifier')).toBeVisible();
    await expect(historyModal.getByText('EN ATTENTE DE VALIDATION')).toBeVisible();
  });

  test('DIRECTOR completes an approved expense only once an invoice is attached', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    const label = unique('Clôture E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);
    await apiApprove(request, sToken, created.id);

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const row = transactionRow(page, label);
    await expect(row.getByText('APPROUVÉE')).toBeVisible();

    // Blocked without an invoice: clicking shows an error and never reaches
    // the confirm() dialog at all (see FinancesPage.handleComplete).
    const completeButton = row.getByRole('button', { name: 'Clôturer' });
    await expect(completeButton).toBeVisible();
    await completeButton.click();
    await expect(page.getByText('Une facture est requise avant de clôturer cette dépense.')).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('APPROUVÉE')).toBeVisible(); // unchanged

    await apiUploadInvoice(request, dToken, created.id);
    await page.reload();
    const rowAfterInvoice = transactionRow(page, label);
    page.once('dialog', d => d.accept());
    await rowAfterInvoice.getByRole('button', { name: 'Clôturer' }).click();
    await expect(page.getByText('Dépense clôturée.')).toBeVisible({ timeout: 10_000 });
    await expect(rowAfterInvoice.getByText('CLÔTURÉE')).toBeVisible();
  });

  test('DIRECTOR cancels an approved expense after confirming', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    const label = unique('Annulation E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);
    await apiApprove(request, sToken, created.id);

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const row = transactionRow(page, label);
    await expect(row.getByText('APPROUVÉE')).toBeVisible();

    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByText('Dépense annulée.')).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('ANNULÉE')).toBeVisible();
  });

  test('insufficient budget is surfaced clearly on approval', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    // Isolated category+period so this test's tiny budget never collides
    // with the generous default used by every other test in this file.
    // Budget editing is SUPERVISOR-only — dToken would 403 here.
    await apiSetBudget(request, sToken, 5000, 'EQUIPEMENT');
    const label = unique('Budget insuffisant E2E');
    const created = await apiCreateExpense(request, dToken, {
      label, category: 'EQUIPEMENT', amountXof: 50000,
    });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    const pendingCard = page.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
    await pendingCard.getByRole('button', { name: 'Approuver' }).click();
    await page.getByTestId('expense-decision-modal').getByRole('button', { name: 'Approuver' }).click();

    await expect(page.getByText('Budget disponible insuffisant')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Demandé : 50 000 FCFA')).toBeVisible();
  });

  test('DIRECTOR: correct actions appear for each workflow state; SUPERVISOR cannot create/edit/complete/cancel', async ({ page, browser, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Matrice actions E2E');
    const created = await apiCreateExpense(request, dToken, { label });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    let row = transactionRow(page, label);
    await expect(row.getByRole('button', { name: 'Soumettre' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Resoumettre' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Clôturer' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Abandonner' })).toHaveCount(0);

    // SUPERVISOR: no create button, no edit/delete pencil-trash on this row,
    // no submit/resubmit/complete/cancel controls anywhere.
    const supervisorContext = await browser.newContext();
    const supervisorPage = await supervisorContext.newPage();
    await loginAsSupervisor(supervisorPage);
    await supervisorPage.goto('/app/finances');
    await expect(supervisorPage.getByRole('button', { name: 'Dépense' })).toHaveCount(0);
    await expect(supervisorPage.getByRole('button', { name: 'Entrée' })).toHaveCount(0);
    row = transactionRow(supervisorPage, label);
    await expect(row.getByRole('button', { name: 'Soumettre' })).toHaveCount(0);
    await expect(row.locator('button[title="Modifier"]')).toHaveCount(0);
    await expect(row.locator('button[title="Supprimer"]')).toHaveCount(0);
    await supervisorContext.close();

    void created;
  });
});

test.describe('Expense workflow — mobile layout (PR 5E)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('pending-approval section and decision modal render without horizontal overflow on mobile', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const label = unique('Mobile E2E');
    const created = await apiCreateExpense(request, dToken, { label });
    await apiSubmit(request, dToken, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    await expect(page.getByText('Demandes à valider')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const pendingCard = page.locator(`xpath=//p[text()="${label}"]/ancestor::li[1]`);
    await pendingCard.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByTestId('expense-decision-modal')).toBeVisible();
  });
});
