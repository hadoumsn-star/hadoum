import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, login } from '../../e2e/helpers';

// Manual-style QA campaign — Module 1 (Individual Child Record)
// All created data is prefixed TEST-E2E- per campaign safety rules.
// Screenshots saved to e2e-manual/evidence/module1/.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module1');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

// Track failed network responses (4xx/5xx) across a test for evidence.
function trackFailedRequests(page: Page): { url: string; method: string; status: number }[] {
  const failures: { url: string; method: string; status: number }[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      failures.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });
  return failures;
}

test.describe('M1-001 — Children list', () => {
  test('DIRECTOR opens Children module, list loads with key columns, no failed API calls', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await snap(page, 'after-login');

    await page.getByRole('link', { name: /enfants|dossiers/i }).first().click().catch(async () => {
      // fallback: navigate directly if sidebar label differs
      await page.goto('/app/children');
    });
    await expect(page.getByText('Dossiers enfants')).toBeVisible({ timeout: 10_000 });
    await snap(page, 'children-list');

    // Key columns
    for (const col of ['Nom', 'Âge', 'Classe', 'Présence', 'Dossier']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }

    expect(failures, `Failed API calls while loading Children list: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M1-002 — Create child, minimal fields', () => {
  test('DIRECTOR creates a child using only mandatory fields', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/children');
    await expect(page.getByText('Dossiers enfants')).toBeVisible();

    const firstName = 'TEST-E2E-Prenom';
    const lastName = `TEST-E2E-Nom-${Date.now()}`;

    await page.getByRole('button', { name: 'Ajouter un enfant' }).click();
    await snap(page, 'add-modal-step1');

    await page.getByPlaceholder('Amine').fill(firstName);
    await page.getByPlaceholder('Belarbi').fill(lastName);
    await page.getByPlaceholder('JJ/MM/AAAA').first().fill('15/06/2015');
    await snap(page, 'add-modal-step1-filled');

    await page.getByRole('button', { name: /continuer/i }).click();
    // step 2 — classe defaults, admission date optional
    await snap(page, 'add-modal-step2');
    await page.getByRole('button', { name: /continuer/i }).click();
    // step 3 — tuteur optional
    await snap(page, 'add-modal-step3');
    await page.getByRole('button', { name: /continuer/i }).click();
    // step 4 — documents optional
    await snap(page, 'add-modal-step4');

    await page.getByRole('button', { name: /enregistrer/i }).click();

    // Modal should close and child should appear in list
    await expect(page.getByRole('button', { name: 'Ajouter un enfant' })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('Rechercher un enfant…').fill(lastName);
    await snap(page, 'after-create-search');
    await expect(page.getByText(`${firstName} ${lastName}`).or(page.getByText(`${lastName}`))).toBeVisible({ timeout: 10_000 });

    expect(failures, `Failed API calls during child creation: ${JSON.stringify(failures)}`).toEqual([]);
  });
});
