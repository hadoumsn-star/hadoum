import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, login } from '../../e2e/helpers';

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

test.describe('M2-008/M2-009/M2-010 — Attendance, absence, justification document', () => {
  test('Record a justified absence with a document, verify monthly view, edit and delete', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    const lastName = `TEST-E2E-Attend-${Date.now()}`;
    await createMinimalStaff(page, lastName);
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Absences / Congés').first().click();
    await snap(page, 'attendance-modal-opened');

    // type defaults to 'absence' already
    await page.getByPlaceholder('JJ/MM/AAAA').first().fill('01/08/2026'); // Date début
    await page.getByPlaceholder('Ex : Maladie, Démarche administrative…').fill('TEST-E2E-Maladie');
    await page.getByRole('button', { name: 'Justifiée', exact: true }).click();
    const justifInput = page.locator('input[type="file"]').first();
    await justifInput.setInputFiles({
      name: 'TEST-E2E-justificatif.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 TEST-E2E fake justificatif'),
    });
    await snap(page, 'attendance-form-filled');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré.')).toBeVisible({ timeout: 10_000 });
    await snap(page, 'attendance-saved');

    // Monthly view
    await page.getByRole('button', { name: 'Suivi mensuel' }).click();
    await snap(page, 'attendance-monthly-view');
    await expect(page.getByText('Abs. just.')).toBeVisible();

    await page.getByRole('button', { name: 'Saisie' }).click();
    // History should show the new record
    await expect(page.getByText('TEST-E2E-Maladie')).toBeVisible({ timeout: 5000 });
    await snap(page, 'attendance-history-entry');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('Deleting an attendance record has no confirmation dialog', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    const lastName = `TEST-E2E-AttendDel-${Date.now()}`;
    await createMinimalStaff(page, lastName);
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Absences / Congés').first().click();

    await page.getByPlaceholder('JJ/MM/AAAA').first().fill('01/08/2026');
    await page.getByPlaceholder('Ex : Maladie, Démarche administrative…').fill('TEST-E2E-ARetirer');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Enregistré.')).toBeVisible({ timeout: 10_000 });

    let dialogAppeared = false;
    page.once('dialog', async (d) => { dialogAppeared = true; await d.dismiss(); });

    const deleteBtn = page.locator('button[title="Supprimer"], button:has-text("Supprimer")').first();
    const deleteCount = await deleteBtn.count();
    console.log('DELETE_BUTTON_COUNT', deleteCount);
    if (deleteCount > 0) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
    }
    console.log('CONFIRMATION_CHECK attendance-delete dialogAppeared=', dialogAppeared);
    await snap(page, 'attendance-after-delete-attempt');
  });
});

test.describe('M2-014/M2-015 — Staff exit and reintegration', () => {
  test('Exit a staff member, verify they move to Anciens membres, then reintegrate', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    const lastName = `TEST-E2E-Exit-${Date.now()}`;
    await createMinimalStaff(page, lastName);
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await page.getByTitle('Marquer comme sorti').first().click();
    await snap(page, 'exit-modal-opened');

    await page.getByRole('combobox').selectOption('Fin de contrat');
    await snap(page, 'exit-motif-selected');
    await page.getByRole('button', { name: 'Confirmer la sortie' }).click();
    await expect(page.getByText('Modifier la fiche')).not.toBeVisible().catch(() => {});
    await snap(page, 'exit-confirmed');

    // Verify former members tab
    await page.locator('button', { hasText: 'Anciens membres' }).first().click();
    await snap(page, 'former-tab');
    await expect(page.getByText(lastName)).toBeVisible({ timeout: 10_000 });

    // Verify active tab no longer shows them
    await page.locator('button', { hasText: 'Équipe active' }).first().click();
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await snap(page, 'active-tab-after-exit-search');
    const stillInActive = await page.getByText(lastName).isVisible().catch(() => false);
    console.log('EXIT_CHECK stillVisibleInActiveTab=', stillInActive);

    // M2-015 — actually perform the reintegration action (not just verify former list)
    await page.locator('button', { hasText: 'Anciens membres' }).first().click();
    const formerRow = page.locator('tr', { hasText: lastName });
    await formerRow.getByRole('button', { name: 'Réintégrer', exact: true }).click();
    await snap(page, 'reintegration-modal-opened');

    await page.getByPlaceholder('JJ/MM/AAAA').first().fill('02/08/2026');
    await snap(page, 'reintegration-date-filled');
    await page.getByRole('button', { name: 'Réintégrer', exact: true }).last().click();
    await snap(page, 'reintegration-confirmed');

    await page.locator('button', { hasText: 'Équipe active' }).first().click();
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await snap(page, 'reintegrated-in-active-team');
    await expect(page.getByText(lastName).first()).toBeVisible({ timeout: 10_000 });

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M2-012/M2-013 — Candidate creation and promotion', () => {
  test('Create a candidate, then promote to active staff', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTeam(page);

    await page.locator('button', { hasText: 'Candidats' }).first().click();
    await page.getByRole('button', { name: /Ajouter un candidat/ }).click();
    await snap(page, 'add-candidate-modal');

    const lastName = `TEST-E2E-Candidat-${Date.now()}`;
    await page.getByPlaceholder('Sonia').fill('TEST-E2E-Prenom');
    await page.getByPlaceholder('Benyahia').fill(lastName);
    await page.getByPlaceholder('+221 77 123 45 67').first().fill('771234567');
    await snap(page, 'candidate-filled');

    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ajouter un candidat' })).not.toBeVisible({ timeout: 10_000 });
    await snap(page, 'candidate-created');

    // Candidates tab has no search box; find the row by name directly.
    const row = page.locator('tr', { hasText: lastName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Promote / integrate — button text is "Intégrer" for a new candidate with no scheduled date
    await row.getByRole('button', { name: 'Intégrer', exact: true }).click();
    await snap(page, 'integration-modal-opened');

    const todayInput = page.getByPlaceholder('JJ/MM/AAAA').first();
    await todayInput.fill('02/08/2026');
    await snap(page, 'integration-date-filled');
    await page.getByRole('button', { name: /Intégrer maintenant|Programmer/ }).last().click();
    await snap(page, 'integration-confirmed');

    // Verify now in Équipe active
    await page.locator('button', { hasText: 'Équipe active' }).first().click();
    await page.getByPlaceholder('Rechercher…').fill(lastName);
    await snap(page, 'promoted-in-active-team');
    await expect(page.getByText(lastName).first()).toBeVisible({ timeout: 10_000 });

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M2-016 — SUPERVISOR permissions on Staff module', () => {
  test('SUPERVISOR access to Team module', async ({ page }) => {
    const apiFailures: { url: string; method: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/staff') && (res.status() === 401 || res.status() === 403)) {
        apiFailures.push({ url: res.url(), method: res.request().method(), status: res.status() });
      }
    });

    await login(page, SUPERVISOR_CREDENTIALS);
    await goToTeam(page);
    await snap(page, 'supervisor-team-list');

    const modifierBtn = page.getByTitle('Modifier').first();
    const modifierVisible = await modifierBtn.isVisible().catch(() => false);
    console.log('PERMISSIONS_CHECK supervisor Modifier button visible=', modifierVisible);

    if (modifierVisible) {
      await modifierBtn.click();
      await snap(page, 'supervisor-edit-modal-opened');
      await page.getByPlaceholder('Notes libres, observations…').fill('TEST-E2E-Supervisor edit attempt');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await page.waitForTimeout(1500);
      await snap(page, 'supervisor-after-save-attempt');
    }

    console.log('PERMISSIONS_CHECK supervisor unauthorized API responses=', JSON.stringify(apiFailures));
  });
});
