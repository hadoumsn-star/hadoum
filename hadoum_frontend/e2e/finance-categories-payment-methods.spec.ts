import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// Standardization of Expense Categories (exactly 9) and Payment Methods
// (Mobile Money split into Wave/Orange). Backend-side coverage (Prisma enum
// additive migration, budget defaults idempotency, SALAIRES 0-budget
// dashboard math) lives in hadoum_api's budget-categories.e2e-spec.ts and
// finances.e2e-spec.ts — this file covers the frontend-visible contract:
// the "new expense" dropdowns only ever offer the standardized sets, while
// historical rows using a legacy category or Mobile Money stay fully
// readable and editable.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

const EXPENSE_CATEGORY_LABELS = [
  'Alimentation', 'Santé', 'Vêtements', 'Transport', 'Études',
  'Sport', 'Loisirs', 'Bureau et factures', 'Salaires',
];
const LEGACY_CATEGORY_LABELS = ['Entretien', 'Pédagogie', 'Équipement', 'Autre'];

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

async function apiCreateTransaction(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/finances/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

test.describe('Finances — standardized expense categories (9)', () => {
  test('the new-expense category dropdown offers exactly the 9 standardized categories', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const options = modal.locator('#expense-category option');
    await expect(options).toHaveCount(EXPENSE_CATEGORY_LABELS.length);
    const texts = await options.allTextContents();
    expect(texts.sort()).toEqual([...EXPENSE_CATEGORY_LABELS].sort());
    for (const legacy of LEGACY_CATEGORY_LABELS) {
      expect(texts).not.toContain(legacy);
    }
    await page.getByRole('button', { name: 'Annuler' }).click();
  });

  test('a historical transaction using a legacy category (Équipement) still displays correctly in the list', async ({ page, request }) => {
    const token = await directorToken(request);
    // Deliberately doesn't contain "Équipement" itself, so the row's
    // category-badge locator below can't ambiguously match the label too.
    const label = unique('Dépense catégorie héritée');
    await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'EQUIPEMENT', label, amountXof: 12000, date: '2026-08-01',
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const row = page.getByText(label).locator('..').locator('..');
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText(/^Équipement ·/)).toBeVisible();
  });

  test('editing a transaction with a legacy category preserves it (shown, not blank) and lets other fields be edited', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Dépense Pédagogie héritée');
    await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'PEDAGOGIE', label, amountXof: 9000, date: '2026-08-01',
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByText(label).locator('..').locator('..').getByTitle('Modifier').click();
    const modal = page.getByTestId('transaction-modal');
    await expect(modal.locator('#expense-category')).toHaveValue('PEDAGOGIE');

    // Editing the label (not the category) must not disturb the legacy category.
    const newLabel = unique('Dépense Pédagogie modifiée');
    await modal.locator('#expense-label').fill(newLabel);
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);

    await page.getByText(newLabel).locator('..').locator('..').getByTitle('Modifier').click();
    await expect(page.getByTestId('transaction-modal').locator('#expense-category')).toHaveValue('PEDAGOGIE');
  });
});

test.describe('Finances — standardized payment methods (Wave/Orange Mobile Money)', () => {
  test('the payment method dropdown no longer offers "Mobile Money" for a new expense', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const options = await modal.locator('#expense-payment-method option').allTextContents();
    expect(options).toContain('Wave Mobile Money');
    expect(options).toContain('Orange Mobile Money');
    expect(options).not.toContain('Mobile Money');
    await page.getByRole('button', { name: 'Annuler' }).click();
  });

  test('a new expense can be created with Wave Mobile Money', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const label = unique('Dépense Wave');
    await modal.locator('#expense-label').fill(label);
    await modal.locator('#expense-amount').fill('7000');
    await modal.locator('#expense-payment-method').selectOption('WAVE_MOBILE_MONEY');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(label)).toBeVisible();
    await expect(page.getByText(label).locator('..').locator('..')).toContainText('Wave Mobile Money');
  });

  test('a new expense can be created with Orange Mobile Money', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const label = unique('Dépense Orange');
    await modal.locator('#expense-label').fill(label);
    await modal.locator('#expense-amount').fill('6500');
    await modal.locator('#expense-payment-method').selectOption('ORANGE_MOBILE_MONEY');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(label)).toBeVisible();
    await expect(page.getByText(label).locator('..').locator('..')).toContainText('Orange Mobile Money');
  });

  test('a historical Mobile Money transaction still displays correctly and is preserved on unrelated edits', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Dépense Mobile Money héritée');
    await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'ALIMENTATION', label, amountXof: 8000, date: '2026-08-01',
      paymentMethod: 'MOBILE_MONEY',
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByText(label)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(label).locator('..').locator('..')).toContainText('Mobile Money');

    await page.getByText(label).locator('..').locator('..').getByTitle('Modifier').click();
    const modal = page.getByTestId('transaction-modal');
    await expect(modal.locator('#expense-payment-method')).toHaveValue('MOBILE_MONEY');

    const newLabel = unique('Dépense Mobile Money modifiée');
    await modal.locator('#expense-label').fill(newLabel);
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(newLabel).locator('..').locator('..')).toContainText('Mobile Money');
  });

  test('every other existing payment method is preserved (Espèces, Virement, Chèque, Carte, Autre)', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const options = await modal.locator('#expense-payment-method option').allTextContents();
    for (const label of ['Espèces', 'Virement', 'Chèque', 'Carte', 'Autre']) {
      expect(options).toContain(label);
    }
    await page.getByRole('button', { name: 'Annuler' }).click();
  });
});
