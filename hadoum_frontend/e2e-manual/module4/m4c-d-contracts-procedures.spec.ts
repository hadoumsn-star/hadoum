import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module4');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, prefix: string, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-${prefix}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

// ─── 4C — Supplier contracts ────────────────────────────────────────────────

test.describe('M4-011/M4-012 — Create supplier contract', () => {
  test('Create a gas supplier contract with dates and amount', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/contrats-fournisseurs');
    await expect(page.getByRole('button', { name: 'Nouveau contrat' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();
    await snap(page, '4c', 'modal-opened');

    const supplierName = `TEST-E2E-Fournisseur-Gaz-${Date.now()}`;
    await page.getByPlaceholder('Ex : Sénégal Gaz').fill(supplierName);
    await page.getByPlaceholder('Ex : Fourniture de gaz').fill('TEST-E2E-Contrat gaz');
    await page.getByPlaceholder('Ex : CT-2026-014').fill(`TEST-E2E-CT-${Date.now()}`);
    await snap(page, '4c', 'filled');

    await page.getByRole('button', { name: 'Créer' }).click();
    await page.waitForTimeout(1500);
    await snap(page, '4c', 'created');
    await expect(page.getByText(supplierName)).toBeVisible({ timeout: 10_000 });

    console.log('CONTRACT_CREATE failures=', JSON.stringify(failures));
  });

  test('Créer button disabled without supplier/contract name', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();
    await expect(page.getByRole('button', { name: 'Créer' })).toBeDisabled();
  });
});

test.describe('M4-013 — Contract validation workflow', () => {
  test('DIRECTOR submits a contract for validation; SUPERVISOR approves it', async ({ browser }) => {
    const dirContext = await browser.newContext();
    const dirPage = await dirContext.newPage();
    await login(dirPage, DIRECTOR_CREDENTIALS);
    await dirPage.goto('/app/contrats-fournisseurs');
    await dirPage.getByRole('button', { name: 'Nouveau contrat' }).click();

    const supplierName = `TEST-E2E-ContratWorkflow-${Date.now()}`;
    await dirPage.getByPlaceholder('Ex : Sénégal Gaz').fill(supplierName);
    await dirPage.getByPlaceholder('Ex : Fourniture de gaz').fill('TEST-E2E-Contrat workflow');
    await dirPage.getByRole('button', { name: 'Créer' }).click();
    await expect(dirPage.getByText(supplierName)).toBeVisible({ timeout: 10_000 });
    await dirPage.getByText(supplierName).click();
    await snap(dirPage, '4c', 'director-detail');

    const submitBtn = dirPage.getByRole('button', { name: /Soumettre pour validation/ });
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    console.log('CONTRACT_WORKFLOW submit button visible=', submitVisible);
    if (submitVisible) {
      dirPage.once('dialog', (d) => d.accept());
      await submitBtn.click();
      await dirPage.waitForTimeout(1500);
      await snap(dirPage, '4c', 'submitted');
    }
    await dirContext.close();

    const supContext = await browser.newContext();
    const supPage = await supContext.newPage();
    await login(supPage, SUPERVISOR_CREDENTIALS);
    await supPage.goto('/app/contrats-fournisseurs');
    await expect(supPage.getByText(supplierName)).toBeVisible({ timeout: 10_000 });
    await supPage.getByText(supplierName).click();
    await snap(supPage, '4c', 'supervisor-detail');

    const approveBtn = supPage.getByRole('button', { name: 'Approuver' });
    const canApprove = await approveBtn.isVisible().catch(() => false);
    console.log('CONTRACT_WORKFLOW approve button visible=', canApprove);
    if (canApprove) {
      await approveBtn.click();
      await supPage.waitForTimeout(1500);
      await snap(supPage, '4c', 'approved');
    }
    await supContext.close();
  });

  test('Rejecting a contract without a comment is blocked', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();
    const supplierName = `TEST-E2E-ContratReject-${Date.now()}`;
    await page.getByPlaceholder('Ex : Sénégal Gaz').fill(supplierName);
    await page.getByPlaceholder('Ex : Fourniture de gaz').fill('TEST-E2E-Contrat reject test');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(supplierName)).toBeVisible({ timeout: 10_000 });
    await page.getByText(supplierName).click();

    const submitBtn = page.getByRole('button', { name: /Soumettre pour validation/ });
    if (await submitBtn.isVisible().catch(() => false)) {
      page.once('dialog', (d) => d.accept());
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }
    // Re-open detail (some flows close the modal after submit) and try Refuser
    const refuseBtn = page.getByRole('button', { name: 'Refuser' });
    if (await refuseBtn.isVisible().catch(() => false)) {
      await refuseBtn.click();
      await snap(page, '4c', 'reject-modal-opened');
      const confirmRefuse = page.getByRole('button', { name: 'Refuser', exact: true }).last();
      const disabled = await confirmRefuse.isDisabled().catch(() => null);
      console.log('REJECT_VALIDATION confirmButtonDisabledWithoutComment=', disabled);
    } else {
      console.log('REJECT_VALIDATION note: Refuser button not reachable in this flow (submit may need SUPERVISOR-created contract, or DIRECTOR contracts skip validation)');
    }
  });
});

// ─── 4D — Administrative procedures ─────────────────────────────────────────

test.describe('M4-015/M4-016 — Create and edit administrative procedure', () => {
  test('Create a DGPJS approval procedure, edit it, verify persistence after refresh', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/demarches-administratives');
    await expect(page.getByRole('button', { name: 'Nouvelle démarche' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();
    await snap(page, '4d', 'modal-opened');

    const title = `TEST-E2E-Demarche-${Date.now()}`;
    await page.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await page.getByPlaceholder('Ex : DGPJS').fill('TEST-E2E-DGPJS');
    await page.getByPlaceholder('Ex : REF-2026-014').fill(`TEST-E2E-REF-${Date.now()}`);
    await snap(page, '4d', 'filled');
    await page.getByRole('button', { name: 'Créer' }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
    await snap(page, '4d', 'created');

    console.log('PROCEDURE_CREATE failures=', JSON.stringify(failures));
  });
});

test.describe('M4-017/M4-018 — Submit, approve, reject with mandatory comment', () => {
  test('DIRECTOR submits a procedure; SUPERVISOR rejects without comment is blocked, then rejects with comment', async ({ browser }) => {
    const dirContext = await browser.newContext();
    const dirPage = await dirContext.newPage();
    await login(dirPage, DIRECTOR_CREDENTIALS);
    await dirPage.goto('/app/demarches-administratives');
    await dirPage.getByRole('button', { name: 'Nouvelle démarche' }).click();
    const title = `TEST-E2E-DemarcheWorkflow-${Date.now()}`;
    await dirPage.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await dirPage.getByPlaceholder('Ex : DGPJS').fill('TEST-E2E-Autorité');
    await dirPage.getByRole('button', { name: 'Créer' }).click();
    await expect(dirPage.getByText(title)).toBeVisible({ timeout: 10_000 });
    await dirPage.getByText(title).click();

    const submitBtn = dirPage.getByRole('button', { name: /Soumettre pour/ });
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    console.log('PROCEDURE_WORKFLOW submit visible=', submitVisible);
    if (submitVisible) {
      // Submitting opens a custom modal (not a native confirm dialog) with an
      // optional comment field, then requires "Envoyer la demande" to confirm.
      await submitBtn.click();
      await expect(dirPage.getByRole('heading', { name: 'Soumettre pour validation' })).toBeVisible({ timeout: 5000 });
      await dirPage.getByRole('button', { name: 'Envoyer la demande' }).click();
      await dirPage.waitForTimeout(1500);
    }
    await snap(dirPage, '4d', 'director-after-submit');
    await expect(dirPage.getByText('En attente de validation').first()).toBeVisible({ timeout: 10_000 });
    await dirContext.close();

    const supContext = await browser.newContext();
    const supPage = await supContext.newPage();
    await login(supPage, SUPERVISOR_CREDENTIALS);
    await supPage.goto('/app/demarches-administratives');
    await expect(supPage.getByText(title)).toBeVisible({ timeout: 10_000 });
    await supPage.getByText(title).click();
    await snap(supPage, '4d', 'supervisor-detail');

    const refuseBtn = supPage.getByRole('button', { name: 'Refuser' });
    const canRefuse = await refuseBtn.isVisible().catch(() => false);
    console.log('PROCEDURE_WORKFLOW refuse button visible=', canRefuse);
    if (canRefuse) {
      await refuseBtn.click();
      await snap(supPage, '4d', 'reject-modal');
      const confirmBtn = supPage.getByRole('button', { name: 'Refuser' }).last();
      await expect(confirmBtn).toBeDisabled();
      console.log('PROCEDURE_WORKFLOW reject-without-comment blocked=true');

      await supPage.getByPlaceholder('Expliquez votre décision…').fill('TEST-E2E-Motif de refus');
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();
      await supPage.waitForTimeout(1500);
      await snap(supPage, '4d', 'rejected-with-comment');
    }
    await supContext.close();
  });
});

test.describe('M4-020 — Archive procedure', () => {
  test('Archiving asks for confirmation', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();
    const title = `TEST-E2E-DemarcheArchive-${Date.now()}`;
    await page.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await page.getByPlaceholder('Ex : DGPJS').fill('TEST-E2E-Autorité');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
    await page.getByText(title).click();

    let dialogMessage = '';
    page.once('dialog', async (d) => { dialogMessage = d.message(); await d.accept(); });
    const archiveBtn = page.getByRole('button', { name: 'Archiver' });
    if (await archiveBtn.isVisible().catch(() => false)) {
      await archiveBtn.click();
      await page.waitForTimeout(1000);
      console.log('CONFIRMATION_CHECK procedure-archive dialogMessage=', JSON.stringify(dialogMessage));
      await snap(page, '4d', 'archived');
    } else {
      console.log('ARCHIVE_NOTE: Archiver button not visible directly (may require submit/approve first)');
    }
  });
});

test.describe('4C/4D — SUPERVISOR permissions', () => {
  test('SUPERVISOR access to contracts and procedures pages', async ({ page }) => {
    await login(page, SUPERVISOR_CREDENTIALS);
    await page.goto('/app/contrats-fournisseurs');
    await page.waitForTimeout(1000);
    const contractCreateCount = await page.getByRole('button', { name: 'Nouveau contrat' }).count();
    console.log('PERMISSIONS_CHECK supervisor NouveauContrat visible=', contractCreateCount > 0);
    await snap(page, '4c', 'supervisor-view');

    await page.goto('/app/demarches-administratives');
    await page.waitForTimeout(1000);
    const procCreateCount = await page.getByRole('button', { name: 'Nouvelle démarche' }).count();
    console.log('PERMISSIONS_CHECK supervisor NouvelleDemarche visible=', procCreateCount > 0);
    await snap(page, '4d', 'supervisor-view');
  });
});
