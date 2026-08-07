import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// PR 4: Finance/Expenses <-> Contact directory integration, payment method,
// and the dedicated expense-document endpoints. Drives the real app against
// the real backend. Fixture contacts/transactions are created directly
// through the Contact/Finance APIs via Playwright's `request` fixture for
// setup only — every assertion about ContactAutocomplete, payment method,
// documents, and legacy-justificatif behavior is driven through the actual
// FinancesPage UI.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

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

// force=true: fixture setup, not a test of the Contacts duplicate workflow.
async function apiCreateContact(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/contacts?force=true`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

async function apiDeactivateContact(request: APIRequestContext, token: string, id: string) {
  await request.patch(`${API_BASE}/contacts/${id}/deactivate`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiListCategories(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/contacts/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function apiCreateTransaction(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/finances/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

async function apiUploadJustificatif(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/justificatif`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'justif.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') } },
  });
}

function parseXof(text: string): number {
  return parseInt(text.replace(/[^\d]/g, ''), 10);
}

test.describe('Finances — Contact assignment, payment method, documents (PR 4)', () => {
  // The "Entrée" (income) creation button is intentionally hidden from this
  // page — DEPENSE is the only creation entry point now. Income (RECETTE)
  // rows can still exist (see the historical-income test below) and are
  // still editable; only new-income *creation* is unreachable from the UI.
  test('the income creation entry point is hidden; only the expense form is reachable', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    await expect(page.getByRole('button', { name: 'Entrée' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Dépense' }).click();
    const expenseModal = page.getByTestId('transaction-modal');
    await expect(expenseModal.getByLabel('Fournisseur')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
  });

  test('search and select an existing supplier, then create an expense with a payment method', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Recherche');
    await apiCreateContact(request, token, { fullName: supplierName, categoryId: fournisseur.id });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');

    const label = unique('Achat fournitures');
    await modal.locator('#expense-label').fill(label);
    await modal.locator('#expense-amount').fill('12000');
    await modal.locator('#expense-payment-method').selectOption('VIREMENT');

    const supplierField = modal.getByLabel('Fournisseur');
    await supplierField.fill(supplierName);
    await page.getByRole('option', { name: new RegExp(supplierName) }).click();

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);

    // Scope to this row specifically — a broad page-wide text match risks
    // colliding with other transactions sharing a category/payment method.
    const row = page.getByText(label).locator('..').locator('..');
    await expect(row).toContainText(supplierName);
    await expect(row).toContainText('Virement');
  });

  test('inline creation of a new supplier auto-selects it, and clearing the supplier works', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');

    await modal.locator('#expense-label').fill(unique('Dépense inline'));
    await modal.locator('#expense-amount').fill('5000');

    const supplierName = unique('Nouveau Fournisseur');
    const supplierField = modal.getByLabel('Fournisseur');
    await supplierField.fill(supplierName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    const contactModal = page.getByTestId('contact-form-modal');
    await expect(contactModal.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(contactModal.locator('#contact-form-fullName')).toHaveValue(supplierName);
    await contactModal.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await contactModal.getByRole('button', { name: 'Créer' }).click();
    await expect(contactModal).toHaveCount(0);
    await expect(supplierField).toHaveValue(supplierName);

    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await expect(supplierField).toHaveValue('');
  });

  test('creates an expense with a purchase order document', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');

    await modal.locator('#expense-label').fill(unique('Dépense PO'));
    await modal.locator('#expense-amount').fill('8000');
    await modal.locator('input[type="file"]').nth(0).setInputFiles({
      name: 'bon-commande.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
    });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('creates an expense with an invoice document', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');

    await modal.locator('#expense-label').fill(unique('Dépense Facture'));
    await modal.locator('#expense-amount').fill('9000');
    await modal.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'facture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
    });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('creates an expense with a delivery note document', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');

    await modal.locator('#expense-label').fill(unique('Dépense BL'));
    await modal.locator('#expense-amount').fill('7000');
    await modal.locator('input[type="file"]').nth(2).setInputFiles({
      name: 'bon-livraison.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
    });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('a single document upload failure does not lose the transaction, and retry succeeds', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    let intercepted = false;
    await page.route('**/finances/transactions/*/invoice', route => {
      if (!intercepted) { intercepted = true; return route.abort(); }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    const label = unique('Dépense Echec Upload');
    await modal.locator('#expense-label').fill(label);
    await modal.locator('#expense-amount').fill('6000');
    await modal.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'facture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
    });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(modal.getByText('Documents à finaliser')).toBeVisible();
    await expect(modal.getByText('Facture')).toBeVisible();

    await modal.getByRole('button', { name: 'Réessayer' }).click();
    await expect(modal).toHaveCount(0);

    // The transaction itself was never lost — it's in the list either way.
    await expect(page.getByText(label)).toBeVisible();
  });

  test('edits the supplier and payment method of an existing expense', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const label = unique('Dépense à modifier');
    await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'ENTRETIEN', label, amountXof: 3000, date: '2026-08-01',
    });
    const newSupplierName = unique('Fournisseur Edité');
    await apiCreateContact(request, token, { fullName: newSupplierName, categoryId: fournisseur.id });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByText(label).locator('..').locator('..').getByTitle('Modifier').click();

    const modal = page.getByTestId('transaction-modal');
    await expect(modal.getByRole('heading', { name: 'Modifier la dépense' })).toBeVisible();
    await modal.locator('#expense-payment-method').selectOption('WAVE_MOBILE_MONEY');
    const supplierField = modal.getByLabel('Fournisseur');
    await supplierField.fill(newSupplierName);
    await page.getByRole('option', { name: new RegExp(newSupplierName) }).click();
    await modal.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(modal).toHaveCount(0);
    await expect(page.getByText(new RegExp(newSupplierName))).toBeVisible();
  });

  test('an inactive historical supplier remains visible when editing the expense', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Inactif');
    const supplier = await apiCreateContact(request, token, { fullName: supplierName, categoryId: fournisseur.id });
    const label = unique('Dépense Fournisseur Inactif');
    await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'ENTRETIEN', label, amountXof: 4000, date: '2026-08-01',
      supplierContactId: supplier.id,
    });
    await apiDeactivateContact(request, token, supplier.id);

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByText(new RegExp(`${supplierName} \\(inactif\\)`))).toBeVisible();

    await page.getByText(label).locator('..').locator('..').getByTitle('Modifier').click();
    const modal = page.getByTestId('transaction-modal');
    await expect(modal.getByLabel('Fournisseur')).toHaveValue(supplierName);
    await expect(modal.getByText('CONTACT INACTIF', { exact: true })).toBeVisible();
  });

  // RECETTE creation has no UI entry point anymore (the "Entrée" button was
  // removed — DEPENSE is the only creation path from this page now), but
  // RECETTE rows themselves stay fully supported: existing income
  // transactions must still display and remain editable. Created via the API
  // (as a stand-in for a pre-existing/historical row) rather than through the
  // now-removed UI button.
  test('a historical income transaction (named or anonymous donor) still displays and is editable', async ({ page, request }) => {
    const token = await directorToken(request);
    const namedLabel = unique('Don nommé');
    await apiCreateTransaction(request, token, {
      type: 'RECETTE', category: 'DON', label: namedLabel, amountXof: 20000,
      date: '2026-08-01', donorName: 'Amina Ba',
    });
    const anonLabel = unique('Don anonyme');
    await apiCreateTransaction(request, token, {
      type: 'RECETTE', category: 'DON', label: anonLabel, amountXof: 15000,
      date: '2026-08-01', isAnonymousDonor: true,
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByText(new RegExp(`${namedLabel}.*Amina Ba`))).toBeVisible();
    await expect(page.getByText(new RegExp(`${anonLabel}.*Donateur anonyme`))).toBeVisible();

    await page.getByText(namedLabel).locator('..').locator('..').getByTitle('Modifier').click();
    const modal = page.getByTestId('transaction-modal');
    await expect(modal.getByPlaceholder('Nom du donateur')).toHaveValue('Amina Ba');
    await expect(modal.getByLabel('Fournisseur')).toHaveCount(0);
  });

  test('a legacy justificatif remains accessible on an old transaction', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Dépense Justificatif Hérité');
    const created = await apiCreateTransaction(request, token, {
      type: 'DEPENSE', category: 'ENTRETIEN', label, amountXof: 2000, date: '2026-08-01',
    });
    await apiUploadJustificatif(request, token, created.id);

    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByTitle('Voir le justificatif (hérité)').first()).toBeVisible();

    await page.getByText(label).locator('..').locator('..').getByTitle('Modifier').click();
    const modal = page.getByTestId('transaction-modal');
    await expect(modal.getByText('Ancien justificatif (hérité)')).toBeVisible();
  });

  test('budget/expense totals remain correct after adding an expense', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    const before = parseXof(await page.getByText('Dépenses du mois').locator('..').getByText(/FCFA/).first().textContent() ?? '0');

    await page.getByRole('button', { name: 'Dépense' }).click();
    const modal = page.getByTestId('transaction-modal');
    await modal.locator('#expense-label').fill(unique('Dépense Budget'));
    await modal.locator('#expense-amount').fill('10000');
    await modal.locator('#expense-status').selectOption('VALIDE');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);

    await page.reload();
    const after = parseXof(await page.getByText('Dépenses du mois').locator('..').getByText(/FCFA/).first().textContent() ?? '0');
    expect(after - before).toBe(10000);
  });

  test('the expense form remains usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await page.getByRole('button', { name: 'Dépense' }).click();

    const modal = page.getByTestId('transaction-modal');
    await expect(modal.getByLabel('Fournisseur')).toBeVisible();
    const box = await modal.locator('> div').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });
});
