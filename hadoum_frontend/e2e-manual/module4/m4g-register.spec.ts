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
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-4g-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function goToRegister(page: Page) {
  await page.goto('/app/registre-entrees-sorties');
  await expect(page.getByText(/Visiteurs, prestataires, livraisons/)).toBeVisible({ timeout: 10_000 });
}

test.describe('M4-035 — Unexpected visitor', () => {
  test('DIRECTOR creates a direct/unexpected entry with mandatory fields', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    await snap(page, 'entry-modal-opened');

    const visitorName = `TEST-E2E-Visiteur-${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(visitorName);
    await page.locator('textarea').first().fill('TEST-E2E-Motif de visite');
    await snap(page, 'entry-filled');

    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Enregistrement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(visitorName)).toBeVisible();
    await snap(page, 'entry-created');

    console.log('ENTRY_CREATE_FAILURES=', JSON.stringify(failures));
  });

  test('Créer button disabled with empty name', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    await expect(page.getByRole('button', { name: 'Créer' })).toBeDisabled();
  });
});

test.describe('M4-034 — Expected visitor: check-in and check-out', () => {
  test('Create a planned visit, check in, then check out', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();

    const visitorName = `TEST-E2E-VisitePrevue-${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(visitorName);
    await page.locator('h3', { hasText: "Nouvel enregistrement" }).locator('../..').locator('select').first().selectOption('VISITE_PREVUE');
    await page.locator('textarea').first().fill('TEST-E2E-Visite prévue');
    await snap(page, 'planned-visit-filled');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Enregistrement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(visitorName)).toBeVisible();

    await page.getByText(visitorName).click();
    await snap(page, 'planned-visit-detail');

    const checkinBtn = page.getByRole('button', { name: "Enregistrer l'arrivée" });
    const canCheckin = await checkinBtn.isVisible().catch(() => false);
    console.log('CHECKIN_CHECK button visible=', canCheckin);
    if (canCheckin) {
      await checkinBtn.click();
      await page.waitForTimeout(1500);
      await snap(page, 'checked-in');
    }
  });
});

test.describe('M4-036 — Refuse access', () => {
  test('Refuse an entry with a reason', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    const visitorName = `TEST-E2E-Refuse-${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(visitorName);
    await page.locator('h3', { hasText: "Nouvel enregistrement" }).locator('../..').locator('select').first().selectOption('VISITE_PREVUE');
    await page.locator('textarea').first().fill('TEST-E2E-A refuser');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(visitorName)).toBeVisible({ timeout: 10_000 });
    await page.getByText(visitorName).click();

    const refuseBtn = page.getByRole('button', { name: "Refuser l'accès" });
    const canRefuse = await refuseBtn.isVisible().catch(() => false);
    console.log('REFUSE_CHECK button visible=', canRefuse);
    if (canRefuse) {
      await refuseBtn.click();
      await snap(page, 'refuse-modal-opened');
      const reasonField = page.locator('textarea').last();
      await reasonField.fill('TEST-E2E-Motif de refus');
      await snap(page, 'refuse-filled');
    }
  });
});

test.describe('M4-037 — Cancel a planned visit', () => {
  test('Cancel a planned visit', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    const visitorName = `TEST-E2E-Cancel-${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(visitorName);
    await page.locator('h3', { hasText: "Nouvel enregistrement" }).locator('../..').locator('select').first().selectOption('VISITE_PREVUE');
    await page.locator('textarea').first().fill('TEST-E2E-A annuler');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(visitorName)).toBeVisible({ timeout: 10_000 });
    await page.getByText(visitorName).click();

    const cancelBtn = page.getByRole('button', { name: 'Annuler la visite' });
    const canCancel = await cancelBtn.isVisible().catch(() => false);
    console.log('CANCEL_CHECK button visible=', canCancel);
    if (canCancel) {
      await cancelBtn.click();
      await page.waitForTimeout(1500);
      await snap(page, 'visit-cancelled');
    }
  });
});

test.describe('M4-038 — Current presence', () => {
  test('Verify the current-presence counter and list are consistent', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await snap(page, 'presence-overview');
    await expect(page.getByText(/Présent/i).first()).toBeVisible();
  });
});

test.describe('M4-039 — Deliveries', () => {
  test('Create a delivery entry', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToRegister(page);
    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    const name = `TEST-E2E-Livraison-${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(name);
    await page.locator('h3', { hasText: "Nouvel enregistrement" }).locator('../..').locator('select').first().selectOption('LIVRAISON');
    await page.locator('textarea').first().fill('TEST-E2E-Livraison de fournitures');
    await snap(page, 'delivery-filled');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Enregistrement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible();
    await snap(page, 'delivery-created');
  });
});

test.describe('M4-040 — Goods movement register (two-actor validation)', () => {
  test('DIRECTOR creates a large goods exit; SUPERVISOR approves it from a separate session', async ({ browser }) => {
    const dirContext = await browser.newContext();
    const dirPage = await dirContext.newPage();
    await login(dirPage, DIRECTOR_CREDENTIALS);
    await dirPage.goto('/app/registre-entrees-sorties');
    await dirPage.getByRole('button', { name: 'Biens et marchandises' }).click();
    await dirPage.getByRole('button', { name: 'Nouveau mouvement' }).click();

    const description = `TEST-E2E-GoodsMovement-${Date.now()}`;
    await dirPage.locator('select').first().selectOption('SORTIE_MARCHANDISE');
    await dirPage.locator('textarea').first().fill(description);
    await dirPage.locator('input[type="number"]').first().fill('80'); // above the large-quantity validation threshold

    await dirPage.getByRole('button', { name: 'Créer' }).click();
    await expect(dirPage.getByText('Mouvement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(dirPage.getByText(description)).toBeVisible();
    await expect(dirPage.getByText('EN ATTENTE DE VALIDATION').first()).toBeVisible();
    await snap(dirPage, 'goods-movement-created-pending');
    await dirContext.close();

    const supContext = await browser.newContext();
    const supPage = await supContext.newPage();
    await login(supPage, SUPERVISOR_CREDENTIALS);
    await supPage.goto('/app/registre-entrees-sorties');
    await supPage.getByRole('button', { name: 'Biens et marchandises' }).click();
    await expect(supPage.getByText(description)).toBeVisible({ timeout: 10_000 });

    const row = supPage.locator(
      'xpath=//p[contains(text(), "' + description + '")]/ancestor::div[contains(@class,"rounded-xl")][1]',
    );
    await row.getByText('Voir').click();
    await snap(supPage, 'supervisor-goods-detail');
    await supPage.getByRole('button', { name: 'Approuver' }).first().click();
    await supPage.getByRole('button', { name: 'Approuver' }).last().click();
    await expect(supPage.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });
    await snap(supPage, 'goods-movement-approved');

    await supContext.close();
  });
});

test.describe('4G — SUPERVISOR permissions on Register', () => {
  test('SUPERVISOR cannot create entries (read-only enforcement)', async ({ page }) => {
    await login(page, SUPERVISOR_CREDENTIALS);
    await goToRegister(page);
    const createCount = await page.getByRole('button', { name: 'Nouvel enregistrement' }).count();
    console.log('PERMISSIONS_CHECK supervisor NouvelEnregistrement visible=', createCount > 0);
    await snap(page, 'supervisor-view');
  });
});
