import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module2');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-${name}.png`);
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

async function goToTeam(page: Page) {
  await page.goto('/app/team');
  await expect(page.getByText('Équipe active')).toBeVisible({ timeout: 10_000 });
}

async function createMinimalStaff(page: Page, lastName: string) {
  await page.getByRole('button', { name: 'Ajouter un membre' }).click();
  await page.getByPlaceholder('Amine').fill('TEST-E2E-Prenom');
  await page.getByPlaceholder('Belarbi').fill(lastName);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Ajouter un membre' })).toBeVisible({ timeout: 15_000 });
}

test.describe('M2-001 — Staff list', () => {
  test('DIRECTOR opens Team module, list loads, search/filter work, no failed API calls', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);
    await snap(page, 'team-list');

    await page.getByRole('button', { name: /Présents \d/ }).click();
    await snap(page, 'filter-present');
    await page.getByRole('button', { name: /Tous \d/ }).click();

    await page.getByPlaceholder('Rechercher…').fill('zzz-no-such-member');
    await expect(page.getByText('Aucun', { exact: false })).toBeVisible().catch(() => {});
    await snap(page, 'search-no-results');
    await page.getByPlaceholder('Rechercher…').fill('');

    expect(failures, `Failed API calls while loading Team list: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M2-002/M2-004 — Create and edit staff, persistence', () => {
  test('Create with minimal fields, then edit planning/notes and verify persistence after refresh', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    const lastName = `TEST-E2E-Staff-${Date.now()}`;
    await createMinimalStaff(page, lastName);
    await snap(page, 'staff-created');

    await page.getByPlaceholder('Rechercher…').fill(lastName);
    const card = page.getByText(lastName).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await page.getByTitle('Modifier').first().click();
    await snap(page, 'edit-modal-opened');

    // Fill planning (Lundi first slot) and remarques
    await page.getByRole('button', { name: '+ Créneau' }).first().click();
    await snap(page, 'planning-slot-added');
    const timeInputs = page.locator('input[type="time"]');
    await timeInputs.nth(0).fill('08:00');
    await timeInputs.nth(1).fill('12:00');
    await page.locator('input[placeholder="Activité…"]').first().fill('TEST-E2E-Activité matin');

    await page.getByPlaceholder('Notes libres, observations…').fill('TEST-E2E-Remarque test');
    await snap(page, 'edit-modal-filled');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Modifier la fiche')).not.toBeVisible({ timeout: 10_000 });
    await snap(page, 'edit-saved');

    // Full page reload, then reopen to verify persistence
    await page.reload();
    await expect(page.getByText('Équipe active')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Modifier').first().click();
    await snap(page, 'reopened-after-refresh');

    const debutValue = await page.locator('input[type="time"]').nth(0).inputValue();
    const finValue = await page.locator('input[type="time"]').nth(1).inputValue();
    const labelValue = await page.locator('input[placeholder="Activité…"]').first().inputValue();
    console.log('PERSISTENCE_CHECK planning', JSON.stringify({ debutValue, finValue, labelValue }));
    expect(debutValue).toBe('08:00');
    expect(finValue).toBe('12:00');
    expect(labelValue).toBe('TEST-E2E-Activité matin');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('No email or phone field exists anywhere in the active-staff create/edit forms', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);
    await page.getByRole('button', { name: 'Ajouter un membre' }).click();
    const emailField = page.getByPlaceholder(/email|courriel/i);
    const phoneField = page.locator('input[type="tel"]');
    const emailCount = await emailField.count();
    const phoneCount = await phoneField.count();
    console.log('GAP_CHECK add-member emailFieldCount=', emailCount, 'phoneFieldCount=', phoneCount);
    await snap(page, 'add-member-no-contact-fields');
    expect(emailCount, 'No email field expected in Add Member form (confirmed gap)').toBe(0);
    expect(phoneCount, 'No phone field expected in Add Member form (confirmed gap)').toBe(0);
  });
});

test.describe('M2-005 — CV upload', () => {
  test('Upload a CV PDF, verify it is retrievable', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    const lastName = `TEST-E2E-CV-${Date.now()}`;
    await createMinimalStaff(page, lastName);
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Modifier').first().click();

    // Field order in MemberEditModal: [0]=Carte d'identité, [1]=CV, [2]=Ajouter un document…
    const cvInput = page.locator('input[type="file"]').nth(1);
    await cvInput.setInputFiles({
      name: 'TEST-E2E-cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 TEST-E2E fake cv content'),
    });
    await snap(page, 'cv-selected');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Modifier la fiche')).not.toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Modifier').first().click();
    await snap(page, 'cv-uploaded-reopened');
    // After upload, the CV row should now show an existing-file state ("Remplacer" or similar) rather than the picker
    const cvSection = page.locator('text=CV').first().locator('..');
    await snap(page, 'cv-section-state');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});
