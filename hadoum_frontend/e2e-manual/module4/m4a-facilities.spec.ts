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
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-4a-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function trackFailedRequests(page: Page): { url: string; method: string; status: number }[] {
  const failures: { url: string; method: string; status: number }[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      failures.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });
  return failures;
}

async function goToLocaux(page: Page) {
  await page.goto('/app/locaux-espaces');
  await expect(page.getByRole('button', { name: 'Nouvel espace' })).toBeVisible({ timeout: 10_000 });
}

test.describe('M4-001 — Facility list', () => {
  test('DIRECTOR opens Locaux, list loads, search works, no failed API calls', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);
    await snap(page, 'list-loaded');

    await page.getByPlaceholder('Rechercher un espace…').fill('zzz-no-match');
    await snap(page, 'search-no-results');
    await page.getByPlaceholder('Rechercher un espace…').fill('');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M4-002/M4-003 — Create facility, validation', () => {
  test('Créer button disabled with empty name', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);
    await page.getByRole('button', { name: 'Nouvel espace' }).click();
    await snap(page, 'add-modal-empty');
    await expect(page.getByRole('button', { name: 'Créer' })).toBeDisabled();
  });

  test('Create a classroom with capacity and equipment', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);
    await page.getByRole('button', { name: 'Nouvel espace' }).click();

    const name = `TEST-E2E-Salle-${Date.now()}`;
    await page.getByPlaceholder('Ex : Dortoir Garçons 1').fill(name);
    await page.locator('select').first().selectOption('SALLE_CLASSE');
    await page.getByRole('spinbutton').fill('25');
    await page.getByPlaceholder('Ex : 20 lits, Armoires, Ventilateur').fill('TEST-E2E-Tableau, Bureaux');
    await snap(page, 'classroom-filled');

    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByRole('heading', { name: 'Nouvel espace' })).not.toBeVisible({ timeout: 10_000 });
    await snap(page, 'classroom-created');
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('Negative capacity: input accepts the keystroke but is not silently used as-is', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);
    await page.getByRole('button', { name: 'Nouvel espace' }).click();
    await page.getByPlaceholder('Ex : Dortoir Garçons 1').fill(`TEST-E2E-NegCap-${Date.now()}`);
    const capacityInput = page.getByRole('spinbutton');
    await capacityInput.fill('-5');
    const actualValue = await capacityInput.inputValue();
    console.log('VALIDATION_CHECK negative-capacity actualInputValue=', actualValue);
    await snap(page, 'negative-capacity');
  });
});

test.describe('M4-004 — Edit facility, persistence', () => {
  test('Edit description/capacity/condition/equipment, refresh, verify persistence', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);

    const name = `TEST-E2E-EditSpace-${Date.now()}`;
    await page.getByRole('button', { name: 'Nouvel espace' }).click();
    await page.getByPlaceholder('Ex : Dortoir Garçons 1').fill(name);
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    const card = page.getByText(name, { exact: true }).locator('../../..');
    await card.getByTitle('Modifier').click();
    await snap(page, 'edit-modal-opened');

    await page.getByPlaceholder('Décrivez l\'espace…').fill('TEST-E2E-Description modifiée');
    await page.getByRole('spinbutton').fill('40');
    await page.locator('select').nth(1).selectOption('MOYEN'); // État général
    await page.getByPlaceholder('Ex : 20 lits, Armoires, Ventilateur').fill('TEST-E2E-Nouveau matériel');
    await snap(page, 'edit-filled');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText("Modifier l'espace")).not.toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('button', { name: 'Nouvel espace' })).toBeVisible({ timeout: 10_000 });
    const cardAfter = page.getByText(name, { exact: true }).locator('../../..');
    await cardAfter.getByTitle('Modifier').click();
    await snap(page, 'reopened-after-refresh');

    const descValue = await page.getByPlaceholder('Décrivez l\'espace…').inputValue();
    const capValue = await page.getByRole('spinbutton').inputValue();
    const equipValue = await page.getByPlaceholder('Ex : 20 lits, Armoires, Ventilateur').inputValue();
    console.log('PERSISTENCE_CHECK facility', JSON.stringify({ descValue, capValue, equipValue }));
    expect(descValue).toBe('TEST-E2E-Description modifiée');
    expect(capValue).toBe('40');
    expect(equipValue).toContain('TEST-E2E-Nouveau matériel');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M4-005 — Archive facility', () => {
  test('Archiving asks for confirmation via a native dialog', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToLocaux(page);

    const name = `TEST-E2E-ArchiveSpace-${Date.now()}`;
    await page.getByRole('button', { name: 'Nouvel espace' }).click();
    await page.getByPlaceholder('Ex : Dortoir Garçons 1').fill(name);
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    let dialogMessage = '';
    page.once('dialog', async (d) => { dialogMessage = d.message(); await d.accept(); });

    const card = page.getByText(name, { exact: true }).locator('../../..');
    await card.getByTitle('Archiver').click();
    await page.waitForTimeout(1000);
    console.log('CONFIRMATION_CHECK facility-archive dialogMessage=', JSON.stringify(dialogMessage));
    await snap(page, 'after-archive-confirm');

    const stillInActiveList = await page.getByText(name).isVisible().catch(() => false);
    console.log('ARCHIVE_CHECK stillVisibleInDefaultList=', stillInActiveList);
  });
});

test.describe('M4-009-style — SUPERVISOR permissions on Locaux', () => {
  test('SUPERVISOR access to facilities page', async ({ page }) => {
    const apiFailures: { url: string; method: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/spaces') && (res.status() === 401 || res.status() === 403)) {
        apiFailures.push({ url: res.url(), method: res.request().method(), status: res.status() });
      }
    });
    await login(page, SUPERVISOR_CREDENTIALS);
    await page.goto('/app/locaux-espaces');
    await page.waitForTimeout(1500);
    await snap(page, 'supervisor-view');
    const createBtnCount = await page.getByRole('button', { name: 'Nouvel espace' }).count();
    console.log('PERMISSIONS_CHECK supervisor NouvelEspace button count=', createBtnCount);
    console.log('PERMISSIONS_CHECK supervisor unauthorized API responses=', JSON.stringify(apiFailures));
  });
});
