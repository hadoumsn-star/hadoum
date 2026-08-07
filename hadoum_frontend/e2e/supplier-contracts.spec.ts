import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 8: Supplier Contracts <-> Contact directory integration. Drives the
// real app against the real backend (see playwright.config.ts). Fixture
// contacts/contracts are created directly through the Contact/Supplier
// Contract APIs via Playwright's `request` fixture for setup only — every
// assertion about ContactAutocomplete/legacy-contract/inactive-contact
// behavior is driven through the actual SupplierContractsPage UI. Mirrors
// e2e/maintenance-tickets.spec.ts's PR 3 coverage exactly.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}

function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}
function supervisorToken(request: APIRequestContext) {
  return apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
}

// force=true: fixture setup, not a test of the duplicate workflow itself.
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

async function apiCreateContract(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/supplier-contracts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { contractName: 'Contrat fixture', category: 'ELECTRICITE', startDate: '2026-01-01', ...data },
  });
  return res.json();
}

test.describe('Supplier Contracts — Contact assignment (PR 8)', () => {
  test('DIRECTOR opens the new contract form and sees ContactAutocomplete scoped to relevant categories', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();

    const modal = page.getByTestId('contract-modal');
    const supplier = modal.getByLabel('Fournisseur *');
    await expect(supplier).toBeVisible();
    await supplier.click();

    await expect(page.getByRole('button', { name: 'Fournisseur', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prestataire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commerce' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Artisan' })).toBeVisible();
    // Restricted: a category outside the contract's supplier set shouldn't appear as a chip.
    await expect(page.getByRole('button', { name: 'Santé' })).toHaveCount(0);
  });

  test('creates a contract with a selected Contact', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Recherche');
    await apiCreateContact(request, token, { fullName: supplierName, categoryId: fournisseur.id });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();

    const modal = page.getByTestId('contract-modal');
    const contractName = unique('Contrat Élec');
    await modal.getByPlaceholder('Ex : Fourniture de gaz').fill(contractName);

    const supplier = modal.getByLabel('Fournisseur *');
    await supplier.fill(supplierName);
    await page.getByRole('option', { name: new RegExp(supplierName) }).click();
    await expect(supplier).toHaveValue(supplierName);

    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await expect(page.getByText(contractName)).toBeVisible();
    await expect(page.getByText(new RegExp(supplierName))).toBeVisible();
  });

  // Supplier Contracts workflow: every new contract enters validation
  // automatically — the DIRECTOR never has to click a separate "Soumettre
  // pour validation" action.
  test('after creating, shows the exact success message, switches to the pending tab, shows the badge, and hides active-only/submit actions', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur AutoValidation');
    await apiCreateContact(request, token, { fullName: supplierName, categoryId: fournisseur.id });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();

    const modal = page.getByTestId('contract-modal');
    const contractName = unique('Contrat AutoValidation');
    await modal.getByPlaceholder('Ex : Fourniture de gaz').fill(contractName);
    const supplier = modal.getByLabel('Fournisseur *');
    await supplier.fill(supplierName);
    await page.getByRole('option', { name: new RegExp(supplierName) }).click();
    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await expect(page.getByText('Contrat créé et envoyé pour validation.')).toBeVisible({ timeout: 10_000 });

    // Landed directly on "En attente de validation" — no extra click.
    await expect(page.getByRole('button', { name: 'En attente de validation' }))
      .toHaveCSS('background-color', 'rgb(62, 90, 120)');
    const row = page.locator('div').filter({ hasText: contractName }).last();
    await expect(row).toBeVisible();
    await expect(row.getByText('EN ATTENTE DE VALIDATION', { exact: true })).toBeVisible();

    await page.getByText(contractName).click();
    const detail = page.getByTestId('contract-detail-modal');
    // Shown twice (header status badge, uppercased, + the footer's plain
    // "En attente de validation" text swapped in for the action buttons).
    await expect(detail.getByText('En attente de validation', { exact: false }).first()).toBeVisible();
    // No "Soumettre pour validation" (obsolete for a brand-new contract)
    // and no active-only actions until approved.
    await expect(detail.getByRole('button', { name: 'Soumettre pour validation' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Renouveler' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Résilier' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Archiver' })).toHaveCount(0);
    // Still fully editable.
    await expect(detail.getByRole('button', { name: 'Modifier' })).toBeVisible();
  });

  test('DIRECTOR never sees Approve/Reject on a pending contract', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Sans Décision Director');
    await apiCreateContract(request, token, { contractName, supplierName: 'Fournisseur X' });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'En attente de validation' }).click();
    await page.getByText(contractName).click();

    const detail = page.getByTestId('contract-detail-modal');
    await expect(detail.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
  });

  test('SUPERVISOR sees pending contracts with the fields needed to decide, and the list refreshes automatically after a decision', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Refresh Superviseur');
    await apiCreateContract(request, token, {
      contractName, supplierName: 'Fournisseur Refresh', amount: 123_000,
      startDate: '2026-02-01', endDate: '2026-12-31',
    });

    await loginAsSupervisor(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'En attente de validation' }).click();
    const countBefore = await page.getByRole('button', { name: 'En attente de validation' })
      .locator('span').last().innerText();

    const row = page.locator('div').filter({ hasText: contractName }).last();
    await expect(row).toBeVisible();
    await expect(row.getByText('ÉLECTRICITÉ', { exact: false })).toBeVisible();
    await expect(row.getByText(/Montant : 123.?000/)).toBeVisible();
    await expect(row.getByText(/Début/)).toBeVisible();

    await page.getByText(contractName).click();
    const detail = page.getByTestId('contract-detail-modal');
    await expect(detail.getByRole('button', { name: 'Approuver' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Refuser' })).toBeVisible();
    await detail.getByRole('button', { name: 'Approuver' }).click();
    await page.getByTestId('validation-decision-modal').getByRole('button', { name: 'Approuver', exact: true }).click();
    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });

    // Auto-refreshed: no manual reload — the pending count went down and
    // the row is gone from this tab.
    await page.getByTestId('contract-detail-modal').locator('button').first().click(); // close (X)
    await expect(page.getByTestId('contract-detail-modal')).toHaveCount(0);
    const countAfter = await page.getByRole('button', { name: 'En attente de validation' })
      .locator('span').last().innerText();
    expect(parseInt(countAfter, 10)).toBe(parseInt(countBefore, 10) - 1);
    await expect(page.getByText(contractName)).toHaveCount(0);
  });

  test('inline creation of a new supplier auto-selects it, and the contract saves with it', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();

    const modal = page.getByTestId('contract-modal');
    const contractName = unique('Contrat Inline');
    await modal.getByPlaceholder('Ex : Fourniture de gaz').fill(contractName);

    const supplierName = unique('Nouveau Fournisseur');
    const supplier = modal.getByLabel('Fournisseur *');
    await supplier.fill(supplierName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    const contactModal = page.getByTestId('contact-form-modal');
    await expect(contactModal.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(contactModal.locator('#contact-form-fullName')).toHaveValue(supplierName);
    await contactModal.locator('#contact-form-categoryId').selectOption({ label: 'Fournisseur' });
    await contactModal.getByRole('button', { name: 'Créer' }).click();

    await expect(contactModal).toHaveCount(0);
    await expect(supplier).toHaveValue(supplierName);

    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await expect(page.getByText(contractName)).toBeVisible();
    await expect(page.getByText(new RegExp(supplierName))).toBeVisible();
  });

  test('an existing legacy contract (no linked Contact) remains readable', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Legacy');
    const legacySupplier = 'Fournisseur historique (texte libre)';
    await apiCreateContract(request, token, { contractName, supplierName: legacySupplier });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    // Every new contract is now created pending validation (BROUILLON), so
    // it doesn't show on the default "Actifs" tab — "Tous" always has it.
    await page.getByRole('button', { name: 'Tous' }).click();
    await page.getByText(contractName).click();

    const detail = page.getByTestId('contract-detail-modal');
    // Shown twice in the modal (header subtitle + "Fournisseur :" body line).
    await expect(detail.getByText(legacySupplier).first()).toBeVisible();
  });

  test('replaces a legacy free-text supplier with a Contact, and the legacy notice disappears', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const contractName = unique('Contrat À Remplacer');
    const legacySupplier = 'Ancien fournisseur (texte libre)';
    await apiCreateContract(request, token, { contractName, supplierName: legacySupplier });
    const replacementName = unique('Remplacement Fournisseur');
    await apiCreateContact(request, token, { fullName: replacementName, categoryId: fournisseur.id });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Tous' }).click();
    await page.getByText(contractName).click();
    await page.getByTestId('contract-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('contract-modal');
    await expect(page.getByText(`Fournisseur actuel : ${legacySupplier} — non lié au répertoire`)).toBeVisible();

    const supplier = modal.getByLabel('Fournisseur *');
    await supplier.fill(replacementName);
    await page.getByRole('option', { name: new RegExp(replacementName) }).click();

    await expect(page.getByText(`Fournisseur actuel : ${legacySupplier} — non lié au répertoire`)).toHaveCount(0);

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(new RegExp(replacementName))).toBeVisible();
  });

  test('an inactive referenced supplier remains visible with an "Inactif" badge, but cannot be newly selected', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const inactiveName = unique('Fournisseur Inactif');
    const contact = await apiCreateContact(request, token, { fullName: inactiveName, categoryId: fournisseur.id });
    const contractName = unique('Contrat Inactif');
    // Link while still active — a new assignment to an already-inactive
    // contact is correctly rejected by the backend, so the realistic
    // fixture is "assigned, then deactivated later".
    await apiCreateContract(request, token, { contractName, supplierContactId: contact.id });
    await apiDeactivateContact(request, token, contact.id);

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Tous' }).click();
    await page.getByText(contractName).click();

    const detail = page.getByTestId('contract-detail-modal');
    await expect(detail.getByText('INACTIF', { exact: true })).toBeVisible();

    await detail.getByRole('button', { name: 'Modifier' }).click();
    const modal = page.getByTestId('contract-modal');
    await expect(modal.getByLabel('Fournisseur *')).toHaveValue(inactiveName);
    await expect(page.getByText('CONTACT INACTIF', { exact: true })).toBeVisible();

    // Searching from scratch never surfaces an inactive contact for a *new* pick.
    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await modal.getByLabel('Fournisseur *').fill(inactiveName);
    await expect(page.getByRole('option', { name: new RegExp(inactiveName) })).toHaveCount(0);
  });

  test('a freshly-created contract can be approved directly (already pending validation)', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const categories = await apiListCategories(request, dToken);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Validation');
    const contact = await apiCreateContact(request, dToken, { fullName: supplierName, categoryId: fournisseur.id });
    const contractName = unique('Contrat Validation');
    const created = await apiCreateContract(request, dToken, {
      contractName, supplierContactId: contact.id, amount: 600_000,
    });
    // Every new contract now enters the validation workflow automatically —
    // no separate submit-validation call needed (or possible: it's already
    // pending as of creation).
    expect(created.status).toBe('BROUILLON');
    expect(created.validationStatus).toBe('PENDING_VALIDATION');

    const sToken = await supervisorToken(request);
    await request.patch(`${API_BASE}/supplier-contracts/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${sToken}` }, data: {},
    });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Tous' }).click();
    await page.getByText(contractName).click();
    const detail = page.getByTestId('contract-detail-modal');
    await expect(detail.getByText('ACTIF', { exact: true })).toBeVisible();
    // Shown twice in the modal (header subtitle + "Fournisseur :" body line).
    await expect(detail.getByText(supplierName).first()).toBeVisible();
  });

  test('validation reject still works for a contact-linked contract', async ({ page, request, browser }) => {
    const dToken = await directorToken(request);
    const categories = await apiListCategories(request, dToken);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Refus');
    const contact = await apiCreateContact(request, dToken, { fullName: supplierName, categoryId: fournisseur.id });
    const contractName = unique('Contrat Refus');
    await apiCreateContract(request, dToken, {
      contractName, supplierContactId: contact.id, amount: 600_000,
    });
    // Already pending validation as of creation.

    await loginAsSupervisor(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'En attente de validation' }).click();
    await page.getByText(contractName).click();

    const detail = page.getByTestId('contract-detail-modal');
    await detail.getByRole('button', { name: 'Refuser' }).click();

    const decisionModal = page.getByTestId('validation-decision-modal');
    await expect(decisionModal).toBeVisible();
    // The comment is mandatory — the confirm button stays disabled until one
    // is entered.
    const confirmButton = decisionModal.getByRole('button', { name: 'Refuser', exact: true });
    await expect(confirmButton).toBeDisabled();
    await decisionModal.getByPlaceholder('Expliquez votre décision…').fill('Montant trop élevé');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // The decision modal closes and the (still-open) detail modal refreshes
    // to show the new REFUSÉ status — it does not auto-close itself.
    await expect(decisionModal).toHaveCount(0);
    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });
    // Appears twice (header status badge + validation history entry badge).
    await expect(detail.getByText('REFUSÉ', { exact: true }).first()).toBeVisible();

    // Still editable, and resubmittable through the existing workflow —
    // "Modifier"/"Soumettre pour validation" are DIRECTOR-only actions
    // (never shown to the SUPERVISOR session above), so check from a
    // genuinely separate DIRECTOR session/context (the app redirects an
    // already-authenticated session away from /login, so reusing `page`
    // for a second login doesn't work here).
    const directorContext = await browser.newContext();
    const directorPage = await directorContext.newPage();
    await loginAsDirector(directorPage);
    await directorPage.goto('/app/contrats-fournisseurs');
    await directorPage.getByRole('button', { name: 'Tous' }).click();
    await directorPage.getByText(contractName).click();
    const directorDetail = directorPage.getByTestId('contract-detail-modal');
    await expect(directorDetail.getByRole('button', { name: 'Modifier' })).toBeVisible();
    await expect(directorDetail.getByRole('button', { name: 'Soumettre pour validation' })).toBeVisible();
    await directorContext.close();
  });

  test('a contact-linked contract expiring within 30 days stays in Actifs with an "Expire bientôt" badge', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const supplierName = unique('Fournisseur Expiration');
    const contact = await apiCreateContact(request, token, { fullName: supplierName, categoryId: fournisseur.id });
    // Deliberately doesn't contain the words "Expire"/"Bientôt" — the
    // status badge renders that exact text, and a contract *name*
    // containing it would collide with the badge assertion below.
    const contractName = unique('Contrat Facture Imminente');
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await apiCreateContract(request, token, { contractName, supplierContactId: contact.id, endDate: soon });
    // Expiry-derived statuses (Expire bientôt / Expiré) only ever apply to
    // an ACTIF contract — every new contract now starts BROUILLON/pending,
    // so it must be approved first, exactly as before this change.
    const sToken = await supervisorToken(request);
    await request.patch(`${API_BASE}/supplier-contracts/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${sToken}` }, data: {},
    });

    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    // No more dedicated "Expirant bientôt" tab/KPI — the contract is still
    // effectiveStatus === EXPIRE_BIENTOT server-side (unchanged calculation),
    // but the UI now surfaces it inside "Actifs" with an extra badge, so
    // the default tab already shows it.
    await expect(page.getByRole('button', { name: 'Actifs' })).toBeVisible();
    const row = page.locator('div').filter({ hasText: contractName }).last();
    await expect(row).toBeVisible();
    await expect(row.getByText('ACTIF', { exact: true })).toBeVisible();
    await expect(row.getByText('EXPIRE BIENTÔT', { exact: true })).toBeVisible();
  });

  test('the "Expirant bientôt" tab and KPI card no longer exist', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await expect(page.getByRole('button', { name: 'Expirant bientôt' })).toHaveCount(0);
    await expect(page.getByText('Expirant bientôt', { exact: true })).toHaveCount(0);
  });

  test('SUPERVISOR permissions are unchanged: no create control, contracts remain read-only', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/contrats-fournisseurs');
    await expect(page.getByRole('button', { name: 'Nouveau contrat' })).toHaveCount(0);
  });

  test('the contract form remains usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDirector(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'Nouveau contrat' }).click();

    const modal = page.getByTestId('contract-modal');
    await expect(modal.getByLabel('Fournisseur *')).toBeVisible();
    const box = await modal.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });

  test('the pending-validation list, badge, and Approve/Reject actions remain usable on a mobile viewport', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Mobile Pending');
    await apiCreateContract(request, token, { contractName, supplierName: 'Fournisseur Mobile', amount: 200_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSupervisor(page);
    await page.goto('/app/contrats-fournisseurs');
    await page.getByRole('button', { name: 'En attente de validation' }).click();

    const row = page.locator('div').filter({ hasText: contractName }).last();
    await expect(row).toBeVisible();
    await expect(row.getByText('EN ATTENTE DE VALIDATION', { exact: true })).toBeVisible();
    let hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.getByText(contractName).click();
    const detail = page.getByTestId('contract-detail-modal');
    await expect(detail.getByRole('button', { name: 'Approuver' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Refuser' })).toBeVisible();
    const box = await detail.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
    hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
