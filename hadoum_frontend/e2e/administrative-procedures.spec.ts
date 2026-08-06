import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 9: Administrative Procedures <-> Contact directory integration. Drives
// the real app against the real backend (see playwright.config.ts). Fixture
// contacts/procedures are created directly through the Contact/Administrative
// Procedure APIs via Playwright's `request` fixture for setup only — every
// assertion about ContactAutocomplete/legacy-procedure/inactive-contact
// behavior is driven through the actual DemarchesAdministrativesPage UI.
// Mirrors e2e/maintenance-tickets.spec.ts's PR 3 coverage exactly.

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

async function apiCreateProcedure(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/administrative-procedures`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Démarche fixture', procedureType: 'AGREMENT', authority: 'DGPJS', ...data },
  });
  return res.json();
}

test.describe('Administrative Procedures — Contact assignment (PR 9)', () => {
  test('DIRECTOR opens the new procedure form and sees ContactAutocomplete scoped to relevant categories', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    const responsible = modal.getByLabel('Responsable de la démarche');
    await expect(responsible).toBeVisible();
    await responsible.click();

    await expect(page.getByRole('button', { name: 'Administration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prestataire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Social' })).toBeVisible();
    // Restricted: a category outside the procedure's responsible set shouldn't appear as a chip.
    await expect(page.getByRole('button', { name: 'Maintenance' })).toHaveCount(0);
  });

  test('creates a procedure with a selected Contact', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const responsibleName = unique('Responsable Recherche');
    await apiCreateContact(request, token, { fullName: responsibleName, categoryId: administration.id });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    const title = unique('Démarche Contact');
    await modal.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await modal.getByPlaceholder('Ex : DGPJS').fill('DGPJS');

    const responsible = modal.getByLabel('Responsable de la démarche');
    await responsible.fill(responsibleName);
    await page.getByRole('option', { name: new RegExp(responsibleName) }).click();
    await expect(responsible).toHaveValue(responsibleName);

    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(new RegExp(responsibleName))).toBeVisible();
  });

  test('inline creation of a new Contact auto-selects it, and the procedure saves with it', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    const title = unique('Démarche Inline');
    await modal.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await modal.getByPlaceholder('Ex : DGPJS').fill('DGPJS');

    const responsibleName = unique('Nouveau Responsable');
    const responsible = modal.getByLabel('Responsable de la démarche');
    await responsible.fill(responsibleName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    const contactModal = page.getByTestId('contact-form-modal');
    await expect(contactModal.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(contactModal.locator('#contact-form-fullName')).toHaveValue(responsibleName);
    await contactModal.locator('#contact-form-categoryId').selectOption({ label: 'Administration' });
    await contactModal.getByRole('button', { name: 'Créer' }).click();

    await expect(contactModal).toHaveCount(0);
    await expect(responsible).toHaveValue(responsibleName);

    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(new RegExp(responsibleName))).toBeVisible();
  });

  test('an existing legacy procedure (no linked Contact) remains readable', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Legacy');
    const legacyResponsible = 'Responsable historique (texte libre)';
    await apiCreateProcedure(request, token, { title, assignedTo: legacyResponsible });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();

    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText(legacyResponsible)).toBeVisible();
  });

  test('replaces a legacy free-text Responsable with a Contact, and the legacy notice disappears', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const title = unique('Démarche À Remplacer');
    const legacyResponsible = 'Ancien responsable (texte libre)';
    await apiCreateProcedure(request, token, { title, assignedTo: legacyResponsible });
    const replacementName = unique('Remplacement Responsable');
    await apiCreateContact(request, token, { fullName: replacementName, categoryId: administration.id });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();
    await page.getByTestId('procedure-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('procedure-modal');
    await expect(page.getByText(`Responsable actuel : ${legacyResponsible} — non lié au répertoire`)).toBeVisible();

    const responsible = modal.getByLabel('Responsable de la démarche');
    await responsible.fill(replacementName);
    await page.getByRole('option', { name: new RegExp(replacementName) }).click();

    await expect(page.getByText(`Responsable actuel : ${legacyResponsible} — non lié au répertoire`)).toHaveCount(0);

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(new RegExp(replacementName))).toBeVisible();
  });

  test('clears the assigned Contact via the clear button', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const responsibleName = unique('Responsable À Effacer');
    const contact = await apiCreateContact(request, token, { fullName: responsibleName, categoryId: administration.id });
    const title = unique('Démarche À Effacer');
    await apiCreateProcedure(request, token, { title, assignedContactId: contact.id });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();
    await page.getByTestId('procedure-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('procedure-modal');
    const responsible = modal.getByLabel('Responsable de la démarche');
    await expect(responsible).toHaveValue(responsibleName);
    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await expect(responsible).toHaveValue('');

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);

    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText(`Responsable : ${responsibleName}`)).toHaveCount(0);
  });

  test('an inactive referenced Contact remains visible with an "Inactif" badge, but cannot be newly selected', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const inactiveName = unique('Responsable Inactif');
    const contact = await apiCreateContact(request, token, { fullName: inactiveName, categoryId: administration.id });
    const title = unique('Démarche Inactif');
    // Link while still active — a new assignment to an already-inactive
    // contact is correctly rejected by the backend, so the realistic
    // fixture is "assigned, then deactivated later".
    await apiCreateProcedure(request, token, { title, assignedContactId: contact.id });
    await apiDeactivateContact(request, token, contact.id);

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();

    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText('INACTIF', { exact: true })).toBeVisible();

    await detail.getByRole('button', { name: 'Modifier' }).click();
    const modal = page.getByTestId('procedure-modal');
    await expect(modal.getByLabel('Responsable de la démarche')).toHaveValue(inactiveName);
    await expect(page.getByText('CONTACT INACTIF', { exact: true })).toBeVisible();

    // Searching from scratch never surfaces an inactive contact for a *new* pick.
    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await modal.getByLabel('Responsable de la démarche').fill(inactiveName);
    await expect(page.getByRole('option', { name: new RegExp(inactiveName) })).toHaveCount(0);
  });

  test('validation submit -> approve still works for a contact-linked procedure', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const categories = await apiListCategories(request, dToken);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const responsibleName = unique('Responsable Validation');
    const contact = await apiCreateContact(request, dToken, { fullName: responsibleName, categoryId: administration.id });
    const title = unique('Démarche Validation');
    const created = await apiCreateProcedure(request, dToken, { title, assignedContactId: contact.id });

    await request.post(`${API_BASE}/administrative-procedures/${created.id}/submit-validation`, {
      headers: { Authorization: `Bearer ${dToken}` }, data: {},
    });

    const sToken = await supervisorToken(request);
    await request.patch(`${API_BASE}/administrative-procedures/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${sToken}` }, data: {},
    });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();
    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText(responsibleName)).toBeVisible();
  });

  test('validation reject still works for a contact-linked procedure', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const categories = await apiListCategories(request, dToken);
    const administration = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION');
    const responsibleName = unique('Responsable Refus');
    const contact = await apiCreateContact(request, dToken, { fullName: responsibleName, categoryId: administration.id });
    const title = unique('Démarche Refus');
    const created = await apiCreateProcedure(request, dToken, { title, assignedContactId: contact.id });
    await request.post(`${API_BASE}/administrative-procedures/${created.id}/submit-validation`, {
      headers: { Authorization: `Bearer ${dToken}` }, data: {},
    });

    await loginAsSupervisor(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'En attente de validation' }).click();
    await page.getByText(title).click();

    const detail = page.getByTestId('procedure-detail-modal');
    await detail.getByRole('button', { name: 'Refuser' }).click();

    const decisionModal = page.getByTestId('validation-decision-modal');
    await expect(decisionModal).toBeVisible();
    await decisionModal.getByPlaceholder('Expliquez votre décision…').fill('Dossier incomplet');
    await decisionModal.getByRole('button', { name: 'Refuser', exact: true }).click();

    await expect(decisionModal).toHaveCount(0);
    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });
    await expect(detail.getByText('REFUSÉ', { exact: true }).first()).toBeVisible();
  });

  test('SUPERVISOR permissions are unchanged: no create control, procedures remain read-only', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/demarches-administratives');
    await expect(page.getByRole('button', { name: 'Nouvelle démarche' })).toHaveCount(0);
  });

  test('the procedure form remains usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    await expect(modal.getByLabel('Responsable de la démarche')).toBeVisible();
    const box = await modal.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });
});
