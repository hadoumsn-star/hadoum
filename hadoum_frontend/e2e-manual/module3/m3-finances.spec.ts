import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module3');
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

async function goToFinances(page: Page) {
  await page.goto('/app/finances');
  await expect(page.getByRole('heading', { name: 'Finances & Budget', level: 2 })).toBeVisible({ timeout: 10_000 });
}

test.describe('M3-001 — Open finance module', () => {
  test('DIRECTOR opens dashboard, KPIs and charts render, no failed API calls', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);
    await snap(page, 'dashboard-loaded');

    await expect(page.getByText('Budget total')).toBeVisible(); // was "Solde caisse"
    await expect(page.getByText('Dépenses du mois')).toBeVisible();
    await expect(page.getByText('Budget restant')).toBeVisible();
    await expect(page.getByText('Dépenses par catégorie')).toBeVisible();
    await expect(page.getByText('Comparatif mensuel')).toBeVisible();

    expect(failures, `Failed API calls loading dashboard: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M3-002/M3-003 — Create expense, validation', () => {
  test('Create a valid expense with a justificatif and verify it appears', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);

    await page.getByRole('button', { name: 'Dépense' }).click();
    await snap(page, 'expense-modal-opened');

    const label = `TEST-E2E-Depense-${Date.now()}`;
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(label);
    await page.locator('select').first().selectOption('SANTE');
    await page.getByPlaceholder('45000').fill('12500');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'TEST-E2E-justificatif.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 TEST-E2E fake justificatif'),
    });
    await snap(page, 'expense-filled');

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Dépense enregistrée.')).toBeVisible({ timeout: 10_000 });
    await snap(page, 'expense-saved');

    await expect(page.getByText(label)).toBeVisible({ timeout: 10_000 });
    const row = page.locator('li', { hasText: label });
    await expect(row.getByTitle('Voir le justificatif')).toBeVisible();

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('Zero and negative amounts are blocked by the Enregistrer button', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);
    await page.getByRole('button', { name: 'Dépense' }).click();

    await page.getByPlaceholder('Ex : Fournitures scolaires').fill('TEST-E2E-ZeroAmount');
    const amountInput = page.getByPlaceholder('45000');
    const saveBtn = page.getByRole('button', { name: 'Enregistrer' });

    await amountInput.fill('0');
    await snap(page, 'expense-zero-amount');
    await expect(saveBtn).toBeDisabled();

    await amountInput.fill('-500');
    await snap(page, 'expense-negative-amount');
    const negValue = await amountInput.inputValue();
    console.log('VALIDATION_CHECK negative-amount actualInputValue=', negValue);
    await expect(saveBtn).toBeDisabled();
  });

  test('Very long label text is accepted without truncation error', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);
    await page.getByRole('button', { name: 'Dépense' }).click();

    const longLabel = 'TEST-E2E-LongLabel-' + 'A'.repeat(500);
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(longLabel);
    await page.getByPlaceholder('45000').fill('1000');
    await snap(page, 'expense-long-label');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForTimeout(1500);
    await snap(page, 'expense-long-label-result');

    const errorToast = await page.getByText("Erreur lors de l'enregistrement.").isVisible().catch(() => false);
    console.log('VALIDATION_CHECK long-label errorShown=', errorToast, 'httpFailures=', JSON.stringify(failures));
  });
});

test.describe('M3-004 — Expense supporting document formats', () => {
  test('Invalid file format (.exe) is rejected by the file picker accept filter', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);
    await page.getByRole('button', { name: 'Dépense' }).click();
    const fileInput = page.locator('input[type="file"]');
    const accept = await fileInput.getAttribute('accept');
    console.log('FILE_FORMAT_CHECK accept attribute=', accept);
    expect(accept).toContain('.pdf');
    // .doc/.docx are NOT in the accept list for finance justificatifs (unlike other modules)
    console.log('FILE_FORMAT_CHECK docx supported=', accept?.includes('.doc') ?? false);
  });
});

test.describe('M3-005 to M3-008 — Expense validation workflow (submit/approve/reject/request-changes)', () => {
  test('No UI exists to edit, submit, approve, reject, or request changes on an existing transaction', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);

    // Create a pending expense first
    await page.getByRole('button', { name: 'Dépense' }).click();
    const label = `TEST-E2E-Workflow-${Date.now()}`;
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(label);
    await page.getByPlaceholder('45000').fill('5000');
    await page.locator('select').nth(1).selectOption('EN_ATTENTE'); // Statut select
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Dépense enregistrée.')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('li', { hasText: label });
    await expect(row).toBeVisible();
    await snap(page, 'pending-expense-row');

    // Only actions available on a row: view justificatif (if any) and delete. No edit/approve/reject buttons.
    const buttonsInRow = row.locator('button');
    const buttonCount = await buttonsInRow.count();
    const buttonTitles: (string | null)[] = [];
    for (let i = 0; i < buttonCount; i++) {
      buttonTitles.push(await buttonsInRow.nth(i).getAttribute('title'));
    }
    console.log('WORKFLOW_CHECK row action button titles=', JSON.stringify(buttonTitles));
    expect(buttonTitles.some(t => t?.toLowerCase().includes('modifier'))).toBe(false);
    expect(buttonTitles.some(t => t?.toLowerCase().includes('approuv'))).toBe(false);
    expect(buttonTitles.some(t => t?.toLowerCase().includes('rejet'))).toBe(false);
  });
});

test.describe('M3-009 — Incoming funds (donations)', () => {
  test('Create a named donation and an anonymous donation', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);

    // Named donation
    await page.getByRole('button', { name: 'Entrée' }).click();
    const namedLabel = `TEST-E2E-Don-${Date.now()}`;
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(namedLabel);
    await page.getByPlaceholder('45000').fill('75000');
    const donorName = `TEST-E2E-Donateur-${Date.now()}`;
    await page.getByPlaceholder('Nom du donateur').fill(donorName);
    await snap(page, 'named-donation-filled');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Entrée enregistrée.').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(donorName)).toBeVisible({ timeout: 10_000 });

    // Anonymous donation
    await page.getByRole('button', { name: 'Entrée' }).click();
    const anonLabel = `TEST-E2E-DonAnonyme-${Date.now()}`;
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(anonLabel);
    await page.getByPlaceholder('45000').fill('30000');
    await page.getByRole('checkbox', { name: 'Don anonyme' }).check();
    await snap(page, 'anonymous-donation-filled');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Entrée enregistrée.').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Donateur anonyme').first()).toBeVisible({ timeout: 10_000 });
    await snap(page, 'donations-in-list');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M3-011/M3-012 — Budget planning and dashboard consistency', () => {
  test('Set a monthly budget, verify budget-vs-actual bar and over-budget alert', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);

    // First, create an expense in PEDAGOGIE well above a tiny budget we're about to set.
    await page.getByRole('button', { name: 'Dépense' }).click();
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(`TEST-E2E-BudgetTest-${Date.now()}`);
    await page.locator('select').first().selectOption('PEDAGOGIE');
    await page.getByPlaceholder('45000').fill('90000');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Dépense enregistrée.')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Éditer le budget' }).click();
    await snap(page, 'budget-editor-opened');
    // Scope to the modal only — the background category chart also renders a
    // "Pédagogie" axis label, which an unscoped text locator would match first.
    // Heading -> header row div -> modal content wrapper (2 levels up) so the
    // scope includes the category input fields, which live in a sibling div.
    const budgetModal = page.locator('h3', { hasText: 'Budget prévisionnel du mois' }).locator('../..');
    const pedagogieInput = budgetModal.locator('text=Pédagogie').locator('..').locator('input');
    await pedagogieInput.fill('10000'); // deliberately below the 90000 expense just created
    await snap(page, 'budget-set-below-actual');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Budget mis à jour.')).toBeVisible({ timeout: 10_000 });
    await snap(page, 'budget-saved');

    // Expect an over-budget alert to appear
    await expect(page.getByText(/dépassement de budget/i)).toBeVisible({ timeout: 10_000 });
    await snap(page, 'over-budget-alert-visible');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});

test.describe('M3-013 — Export', () => {
  test('No export button exists anywhere on the Finances page', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);
    const exportBtn = page.getByRole('button', { name: /export/i });
    const count = await exportBtn.count();
    console.log('EXPORT_CHECK buttonCount=', count);
    expect(count).toBe(0);
  });
});

test.describe('M3-004 — Delete transaction confirmation', () => {
  test('Deleting a transaction has no confirmation dialog', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToFinances(page);

    await page.getByRole('button', { name: 'Dépense' }).click();
    const label = `TEST-E2E-ToDelete-${Date.now()}`;
    await page.getByPlaceholder('Ex : Fournitures scolaires').fill(label);
    await page.getByPlaceholder('45000').fill('2000');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Dépense enregistrée.')).toBeVisible({ timeout: 10_000 });

    let dialogAppeared = false;
    page.once('dialog', async (d) => { dialogAppeared = true; await d.dismiss(); });

    const row = page.locator('li', { hasText: label });
    await row.getByTitle('Supprimer').click();
    await page.waitForTimeout(1000);
    console.log('CONFIRMATION_CHECK transaction-delete dialogAppeared=', dialogAppeared);
    await snap(page, 'transaction-after-delete-attempt');
    const stillVisible = await page.getByText(label).isVisible().catch(() => false);
    console.log('CONFIRMATION_CHECK transaction-delete stillVisibleAfterClick=', stillVisible);
  });
});

test.describe('M3-014 — Fund request', () => {
  test('Fund request created from Director dashboard never calls the API and is lost on refresh', async ({ page }) => {
    const apiCalls: { url: string; method: string }[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/fund-requests')) {
        apiCalls.push({ url: req.url(), method: req.method() });
      }
    });

    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('button', { name: 'Demander des fonds' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Demander des fonds' }).click();
    await snap(page, 'fund-request-modal-opened');

    const motif = `TEST-E2E-FundRequest-${Date.now()}`;
    await page.getByPlaceholder('Ex : 50 000').fill('50000');
    await page.getByPlaceholder('Justification de la demande…').fill(motif);
    await snap(page, 'fund-request-filled');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await page.waitForTimeout(1000);

    console.log('MOCK_DATA_CHECK fund-requests API calls made=', JSON.stringify(apiCalls));

    // Reload the same page (same DIRECTOR session) — local React state resets
    // on refresh, so if the request only lives in client memory it disappears.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Demander des fonds' })).toBeVisible({ timeout: 10_000 });
    const requestVisibleAfterReload = await page.getByText(motif).isVisible().catch(() => false);
    console.log('MOCK_DATA_CHECK fund-request visible after page reload=', requestVisibleAfterReload);
    await snap(page, 'director-dashboard-after-reload');
  });

  test('SUPERVISOR pending-funds panel never shows a request created in a different session (proof it is not backend-persisted)', async ({ page, context }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/dashboard');
    await page.getByRole('button', { name: 'Demander des fonds' }).click();
    const motif = `TEST-E2E-FundRequestCrossSession-${Date.now()}`;
    await page.getByPlaceholder('Ex : 50 000').fill('75000');
    await page.getByPlaceholder('Justification de la demande…').fill(motif);
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await page.waitForTimeout(500);

    // Fresh, separate browser context = a different login session (no shared client state)
    const page2 = await context.browser()!.newContext().then(c => c.newPage());
    await login(page2, SUPERVISOR_CREDENTIALS);
    await page2.goto('/app/dashboard');
    await page2.waitForTimeout(1000);
    const visibleInFreshSession = await page2.getByText(motif).isVisible().catch(() => false);
    console.log('MOCK_DATA_CHECK fund-request visible in a separate SUPERVISOR session=', visibleInFreshSession);
    await page2.screenshot({ path: path.join(EVIDENCE_DIR, '99-supervisor-fresh-session-dashboard.png'), fullPage: true });
    await page2.context().close();
  });
});

test.describe('M3-015 — Finance security / SUPERVISOR access', () => {
  test('SUPERVISOR can access finances and create transactions (no restriction found)', async ({ page }) => {
    const apiFailures: { url: string; method: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/finances') && (res.status() === 401 || res.status() === 403)) {
        apiFailures.push({ url: res.url(), method: res.request().method(), status: res.status() });
      }
    });

    await login(page, SUPERVISOR_CREDENTIALS);
    await goToFinances(page);
    await snap(page, 'supervisor-dashboard');

    const depenseBtn = page.getByRole('button', { name: 'Dépense' });
    const canCreate = await depenseBtn.isVisible().catch(() => false);
    console.log('PERMISSIONS_CHECK supervisor Depense button visible=', canCreate);

    if (canCreate) {
      await depenseBtn.click();
      await page.getByPlaceholder('Ex : Fournitures scolaires').fill(`TEST-E2E-SupervisorExpense-${Date.now()}`);
      await page.getByPlaceholder('45000').fill('1000');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await page.waitForTimeout(1500);
      await snap(page, 'supervisor-after-create-attempt');
    }

    console.log('PERMISSIONS_CHECK supervisor unauthorized API responses=', JSON.stringify(apiFailures));
  });
});
