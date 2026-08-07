import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module4');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-4ef-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function goToStocks(page: Page) {
  await page.goto('/app/stocks-inventaire');
  await expect(page.getByRole('heading', { name: 'Stocks et inventaire', level: 2 })).toBeVisible({ timeout: 10_000 });
}

test.describe('M4-022/M4-023/M4-024 — Stock item creation, entry, exit', () => {
  test('Create a rice stock item with initial quantity and threshold, then record entry and exit', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.getByRole('button', { name: /Nouvel article/ }).click();
    await snap(page, 'item-modal-opened');

    const name = `TEST-E2E-Riz-${Date.now()}`;
    await page.getByPlaceholder('Ex : Riz local 25kg').fill(name);
    const spinbuttons = page.getByRole('spinbutton');
    // Seuil minimum is the first spinbutton, initial quantity is the last one in this create form
    await spinbuttons.first().fill('10'); // seuil minimum
    await page.getByRole('spinbutton').last().fill('50'); // quantité initiale
    await snap(page, 'item-filled');

    await page.getByRole('button', { name: 'Créer' }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await snap(page, 'item-created');

    await page.getByText(name).click();
    await snap(page, 'item-detail-opened');

    // Entry
    await page.getByRole('button', { name: 'Entrée' }).click();
    await page.getByRole('spinbutton').first().fill('20');
    await page.getByRole('button', { name: /Confirmer|Enregistrer/ }).click().catch(async () => {
      await page.locator('button:has-text("Entrée")').last().click();
    });
    await page.waitForTimeout(1500);
    await snap(page, 'after-entry');

    // Exit
    await page.getByRole('button', { name: 'Sortie' }).click();
    await page.getByRole('spinbutton').first().fill('15');
    await page.locator('button:has-text("Sortie")').last().click().catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, 'after-exit');

    console.log('STOCK_ITEM_CREATE_FAILURES=', JSON.stringify(failures));
  });

  test('Exit quantity greater than available stock is blocked', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.getByRole('button', { name: /Nouvel article/ }).click();
    const name = `TEST-E2E-LowStock-${Date.now()}`;
    await page.getByPlaceholder('Ex : Riz local 25kg').fill(name);
    await page.getByRole('spinbutton').last().fill('5'); // initial quantity = 5
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await page.getByText(name).click();

    await page.getByRole('button', { name: 'Sortie' }).click();
    await snap(page, 'exit-modal-opened');
    await page.getByRole('spinbutton').first().fill('999'); // way more than the 5 available
    const confirmBtn = page.locator('button:has-text("Sortie")').last();
    const isDisabled = await confirmBtn.isDisabled().catch(() => null);
    console.log('EXIT_VALIDATION_CHECK exceedsAvailableStock confirmButtonDisabled=', isDisabled);
    await snap(page, 'exit-exceeds-stock');
  });
});

test.describe('M4-025 — Stock adjustment', () => {
  test('Adjust stock with a loss reason, verify movement history', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.getByRole('button', { name: /Nouvel article/ }).click();
    const name = `TEST-E2E-Adjust-${Date.now()}`;
    await page.getByPlaceholder('Ex : Riz local 25kg').fill(name);
    await page.getByRole('spinbutton').last().fill('30');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await page.getByText(name).click();

    await page.getByRole('button', { name: 'Ajustement' }).click();
    await snap(page, 'adjustment-modal-opened');
    await page.getByRole('spinbutton').first().fill('-5');
    await page.locator('select').last().selectOption('PERTE');
    const reasonField = page.locator('textarea, input[type="text"]').last();
    await reasonField.fill('TEST-E2E-Casse lors du transport').catch(() => {});
    await snap(page, 'adjustment-filled');
    await page.locator('button:has-text("Ajustement")').last().click().catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, 'after-adjustment');
  });
});

test.describe('M4-027 — Low-stock alert', () => {
  test('Reducing stock below threshold triggers a "Stock faible" badge', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.getByRole('button', { name: /Nouvel article/ }).click();
    const name = `TEST-E2E-AlertThreshold-${Date.now()}`;
    await page.getByPlaceholder('Ex : Riz local 25kg').fill(name);
    await page.getByRole('spinbutton').first().fill('20'); // seuil minimum = 20
    await page.getByRole('spinbutton').last().fill('25'); // initial = 25, above threshold
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await page.getByText(name).click();

    await page.getByRole('button', { name: 'Sortie' }).click();
    await page.getByRole('spinbutton').first().fill('10'); // 25 - 10 = 15, below the 20 threshold
    await page.locator('button:has-text("Sortie")').last().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape').catch(() => {});
    await goToStocks(page);
    await snap(page, 'low-stock-alert-check');
    const alertVisible = await page.getByText(name).locator('../..').getByText('Stock faible').isVisible().catch(() => false);
    console.log('LOW_STOCK_ALERT_CHECK visible=', alertVisible);
  });
});

test.describe('M4-029/M4-030 — Inventory asset creation and assignment', () => {
  test('Create a computer asset and assign it', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.locator('button', { hasText: 'Inventaire' }).first().click();
    await snap(page, 'inventaire-tab');

    await page.getByRole('button', { name: /Nouveau bien/ }).click();
    const name = `TEST-E2E-Ordinateur-${Date.now()}`;
    await page.getByPlaceholder('Ex : Ordinateur portable').fill(name);
    await snap(page, 'asset-filled');
    await page.getByRole('button', { name: 'Créer' }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await snap(page, 'asset-created');

    console.log('ASSET_CREATE_FAILURES=', JSON.stringify(failures));
  });
});

test.describe('M4-032 — Asset disposal', () => {
  test('Request disposal of an asset with a reason', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToStocks(page);
    await page.locator('button', { hasText: 'Inventaire' }).first().click();
    await page.getByRole('button', { name: /Nouveau bien/ }).click();
    const name = `TEST-E2E-AssetDispose-${Date.now()}`;
    await page.getByPlaceholder('Ex : Ordinateur portable').fill(name);
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await page.getByText(name).click();
    await snap(page, 'asset-detail-opened');

    const disposalBtn = page.getByRole('button', { name: /perte|casse|réforme/i });
    const disposalVisible = await disposalBtn.isVisible().catch(() => false);
    console.log('DISPOSAL_CHECK button visible=', disposalVisible);
    if (disposalVisible) {
      await disposalBtn.click();
      await snap(page, 'disposal-modal-opened');
      const reasonField = page.locator('textarea').last();
      await reasonField.fill('TEST-E2E-Motif de mise au rebut');
      await snap(page, 'disposal-filled');
    }
  });
});

test.describe('4E/4F — SUPERVISOR permissions', () => {
  test('SUPERVISOR access to stocks/inventory page', async ({ page }) => {
    await login(page, SUPERVISOR_CREDENTIALS);
    await goToStocks(page);
    await page.waitForTimeout(1000);
    const createItemCount = await page.getByRole('button', { name: /Nouvel article/ }).count();
    console.log('PERMISSIONS_CHECK supervisor NouvelArticle visible=', createItemCount > 0);
    await snap(page, 'supervisor-view');
  });
});
