import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 12: Stock & Inventory improvements — Consommables/Matériel durable
// labeling, entry/exit/inventory-count permissions, low-stock warnings,
// search/filters, and the new physical inventory count workflow (expected/
// actual/difference + auto-generated adjustment). Fixtures are created
// directly through the Stock API for isolation; assertions run through the
// real StocksInventairePage UI.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

async function apiCreateItem(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/stock-items`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { category: 'ALIMENTAIRE', unit: 'SAC', ...data },
  });
  return res.json();
}

async function apiCreateEntry(request: APIRequestContext, token: string, itemId: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/stock-items/${itemId}/entries`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

async function apiCreateExit(request: APIRequestContext, token: string, itemId: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/stock-items/${itemId}/exits`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

test.describe('Stock & Inventory — Consommables / Matériel durable labeling (PR 12)', () => {
  test('DIRECTOR sees the Consommables, Inventaire physique and Matériel durable tabs', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await expect(page.getByRole('button', { name: 'Consommables' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Inventaire physique' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Matériel durable' })).toBeVisible();
  });
});

test.describe('Stock & Inventory — low stock warning (PR 12)', () => {
  test('an item at or below its minimum quantity shows the low-stock badge and remaining quantity', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('SeuilBas');
    await apiCreateItem(request, token, { name, minimumQuantity: 10, initialQuantity: 10 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByPlaceholder('Rechercher un article…').fill(name);
    const card = page.locator('div').filter({ hasText: name }).filter({ hasText: 'STOCK FAIBLE' }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('10 SAC')).toBeVisible();
  });
});

test.describe('Stock & Inventory — search and filters (PR 12)', () => {
  test('category filter narrows the Consommables list', async ({ page, request }) => {
    const token = await directorToken(request);
    const foodName = unique('Riz');
    const hygieneName = unique('Savon');
    await apiCreateItem(request, token, { name: foodName, category: 'ALIMENTAIRE' });
    await apiCreateItem(request, token, { name: hygieneName, category: 'HYGIENE' });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByPlaceholder('Rechercher un article…').fill(unique('zzz-no-match'));
    await page.getByPlaceholder('Rechercher un article…').fill('');
    const categorySelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Toutes les catégories' }) });
    await categorySelect.selectOption('HYGIENE');
    await expect(page.getByText(hygieneName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(foodName)).toHaveCount(0);
  });

  test('low-stock-only checkbox narrows the list', async ({ page, request }) => {
    const token = await directorToken(request);
    const lowName = unique('BasNiveau');
    const okName = unique('NiveauOk');
    await apiCreateItem(request, token, { name: lowName, minimumQuantity: 10, initialQuantity: 5 });
    await apiCreateItem(request, token, { name: okName, minimumQuantity: 10, initialQuantity: 50 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByText('Stock faible uniquement').click();
    await expect(page.getByText(lowName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(okName)).toHaveCount(0);
  });
});

test.describe('Stock & Inventory — physical inventory count (PR 12)', () => {
  test('DIRECTOR performs a count and sees expected/actual/difference in the history', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('Comptage');
    await apiCreateItem(request, token, { name, initialQuantity: 100 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByRole('button', { name: 'Inventaire physique' }).click();
    await page.locator('select').first().selectOption({ label: name });

    await page.getByRole('button', { name: 'Nouveau comptage' }).click();
    const modal = page.getByRole('heading', { name: 'Inventaire physique' }).locator('../..');
    const qtyInput = modal.locator('input[type="number"]');
    await qtyInput.fill('108');
    await expect(modal.getByText('Écart : +8 SAC')).toBeVisible();
    await modal.getByRole('button', { name: 'Enregistrer le comptage' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    await expect(page.getByText('ATTENDU', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('100', { exact: true })).toBeVisible();
    await expect(page.getByText('108', { exact: true })).toBeVisible();
    await expect(page.getByText('+8', { exact: true })).toBeVisible();
  });

  test('a count with no discrepancy reports zero difference without error', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('SansEcart');
    await apiCreateItem(request, token, { name, initialQuantity: 40 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByRole('button', { name: 'Inventaire physique' }).click();
    await page.locator('select').first().selectOption({ label: name });
    await page.getByRole('button', { name: 'Nouveau comptage' }).click();

    const modal = page.getByRole('heading', { name: 'Inventaire physique' }).locator('../..');
    await expect(modal.getByText('aucun écart constaté')).toBeVisible({ timeout: 10_000 });
    await modal.getByRole('button', { name: 'Enregistrer le comptage' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });
  });
});

test.describe('Stock & Inventory — permissions (PR 12)', () => {
  test('SUPERVISOR sees Entrée/Sortie/Inventaire but not Modifier/Ajustement/Transférer/Archiver', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('SupervisorView');
    await apiCreateItem(request, token, { name, initialQuantity: 20 });

    await loginAsSupervisor(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByPlaceholder('Rechercher un article…').fill(name);
    await page.getByText(name).click();

    const modal = page.getByTestId('stock-item-detail-modal');
    await expect(modal.getByRole('button', { name: 'Entrée' })).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByRole('button', { name: 'Sortie' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Inventaire' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Ajustement' })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Transférer' })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Archiver' })).toHaveCount(0);
  });

  test('SUPERVISOR can record an entry from the detail view', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('SupervisorEntry');
    await apiCreateItem(request, token, { name, initialQuantity: 10 });

    await loginAsSupervisor(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByPlaceholder('Rechercher un article…').fill(name);
    await page.getByText(name).click();
    await page.getByRole('button', { name: 'Entrée' }).click();

    const movementModal = page.getByRole('heading', { name: 'Entrée de stock' }).locator('../..');
    await movementModal.locator('input[type="number"]').fill('5');
    await movementModal.getByRole('button', { name: 'Confirmer' }).click();
    await expect(movementModal).toHaveCount(0, { timeout: 10_000 });
  });
});

test.describe('Stock & Inventory — audit log link (PR 12)', () => {
  test('the detail view links to the audit log, pre-filtered to the Stock module', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('AuditLink');
    await apiCreateItem(request, token, { name, initialQuantity: 5 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByPlaceholder('Rechercher un article…').fill(name);
    await page.getByText(name).click();

    await page.getByRole('link', { name: "Voir dans le journal d'audit" }).click();
    await expect(page).toHaveURL(/\/app\/audit-logs\?module=STOCK/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible();
  });
});

test.describe('Stock & Inventory — movement history wording', () => {
  test('an entry shows the explicit "Quantité ajoutée" wording with before/after stock', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('MouvementEntree');
    const item = await apiCreateItem(request, token, { name, initialQuantity: 10 });
    await apiCreateEntry(request, token, item.id, { quantity: 5 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByRole('button', { name: 'Mouvements' }).click();
    await page.locator('select').first().selectOption({ label: name });

    // Item creation itself logs an initial "Stock initial" ENTRÉE movement
    // (0 → 10), so two ENTRÉE badges are expected here; the quantity/stock
    // wording below is what uniquely identifies our +5 entry.
    await expect(page.getByText('ENTRÉE', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Quantité ajoutée : \+5 Sac/i)).toBeVisible();
    await expect(page.getByText(/Stock avant : 10 Sac/i)).toBeVisible();
    await expect(page.getByText(/Stock après : 15 Sac/i)).toBeVisible();
    // No more terse "10 → 15 (+5)" arrow notation.
    await expect(page.getByText('→')).toHaveCount(0);
  });

  test('an exit shows the explicit "Quantité retirée" wording with before/after stock', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('MouvementSortie');
    const item = await apiCreateItem(request, token, { name, initialQuantity: 15 });
    await apiCreateExit(request, token, item.id, { quantity: 3 });

    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByRole('button', { name: 'Mouvements' }).click();
    await page.locator('select').first().selectOption({ label: name });

    await expect(page.getByText('SORTIE', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Quantité retirée : -3 Sac/i)).toBeVisible();
    await expect(page.getByText(/Stock avant : 15 Sac/i)).toBeVisible();
    await expect(page.getByText(/Stock après : 12 Sac/i)).toBeVisible();

    // Stock quantity itself is unaffected by the presentation change.
    await page.getByRole('button', { name: 'Consommables' }).click();
    await page.getByPlaceholder('Rechercher un article…').fill(name);
    await expect(page.getByText('12 SAC')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Stock & Inventory — mobile layout (PR 12)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('StocksInventairePage has no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    // AppLayout's top bar also renders an <h1> with the same page title —
    // scope to the page's own <h2> specifically.
    await expect(page.getByRole('heading', { name: 'Stocks et inventaire', level: 2 })).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('the Inventaire physique tab is usable on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/stocks-inventaire');
    await page.getByRole('button', { name: 'Inventaire physique' }).click();
    await expect(page.getByText('Sélectionnez un article pour effectuer un inventaire physique')).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
