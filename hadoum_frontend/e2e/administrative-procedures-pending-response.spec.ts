import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// Administrative Procedures — "En attente de réponse" operational tracking
// (this task). Lets a DIRECTOR mark a procedure as waiting on an external
// authority (Mairie, Préfecture, CAF, …) without that being a validation
// event — see AdministrativeProceduresService's MANUALLY_SETTABLE_STATUSES.
// Deliberately does NOT touch the validation workflow/approval process —
// see administrative-procedures.spec.ts for that coverage, untouched by
// this task and still fully passing.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}
function supervisorToken(request: APIRequestContext) {
  return apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
}

async function apiCreateProcedure(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/administrative-procedures`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: unique('Démarche E2E'), procedureType: 'AGREMENT', authority: 'DGPJS', ...data },
  });
  return res.json();
}

function openModalFor(page: import('@playwright/test').Page, title: string) {
  return page.getByText(title).click();
}

test.describe('Administrative Procedures — "En attente de réponse" tracking', () => {
  test('DIRECTOR selects "En attente de réponse" and fills in the Organisme concerné field', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    const title = unique('Démarche Attente Réponse');
    await modal.getByPlaceholder('Ex : Agrément DGPJS').fill(title);
    await modal.getByPlaceholder('Ex : DGPJS').fill('Mairie de Dakar');

    // Organisme concerné isn't shown until the status is selected.
    await expect(modal.getByTestId('procedure-pending-response-organization')).toHaveCount(0);

    await modal.getByTestId('procedure-status-select').selectOption('EN_ATTENTE_REPONSE');
    const organizationField = modal.getByTestId('procedure-pending-response-organization');
    await expect(organizationField).toBeVisible();

    // Required once the field is shown: Save stays disabled without it.
    const saveButton = modal.getByRole('button', { name: 'Créer' });
    await expect(saveButton).toBeDisabled();
    await organizationField.fill('Mairie');
    await expect(saveButton).toBeEnabled();

    await saveButton.click();
    await expect(modal).toHaveCount(0);

    await page.getByRole('button', { name: 'Toutes' }).click();
    const card = page.locator(`xpath=//p[text()="${title}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('🟠 En attente de réponse', { exact: false })).toBeVisible();
    await expect(card.getByText('Organisme : Mairie', { exact: false })).toBeVisible();
  });

  test('Organisme concerné only appears when the status is "En attente de réponse"', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Nouvelle démarche' }).click();

    const modal = page.getByTestId('procedure-modal');
    await expect(modal.getByTestId('procedure-status-select')).toHaveValue('A_PREPARER');
    await expect(modal.getByTestId('procedure-pending-response-organization')).toHaveCount(0);

    await modal.getByTestId('procedure-status-select').selectOption('EN_COURS');
    await expect(modal.getByTestId('procedure-pending-response-organization')).toHaveCount(0);

    await modal.getByTestId('procedure-status-select').selectOption('EN_ATTENTE_REPONSE');
    await expect(modal.getByTestId('procedure-pending-response-organization')).toBeVisible();

    // Switching back away hides it again.
    await modal.getByTestId('procedure-status-select').selectOption('A_PREPARER');
    await expect(modal.getByTestId('procedure-pending-response-organization')).toHaveCount(0);
  });

  test('the badge shows on the list and in the detail view', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Badge E2E');
    await apiCreateProcedure(request, token, {
      title,
      status: 'EN_ATTENTE_REPONSE',
      pendingResponseOrganization: 'Préfecture',
    });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();

    const card = page.locator(`xpath=//p[text()="${title}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('🟠 En attente de réponse', { exact: false })).toBeVisible();

    await openModalFor(page, title);
    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText('🟠 EN ATTENTE DE RÉPONSE', { exact: false })).toBeVisible();
    await expect(detail.getByText('Organisme concerné : Préfecture')).toBeVisible();
  });

  test('SUPERVISOR sees the same badge (read-only) on this page', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Badge Supervisor E2E');
    await apiCreateProcedure(request, token, {
      title,
      status: 'EN_ATTENTE_REPONSE',
      pendingResponseOrganization: 'Tribunal',
    });

    await loginAsSupervisor(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();

    const card = page.locator(`xpath=//p[text()="${title}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('🟠 En attente de réponse', { exact: false })).toBeVisible();
    // Read-only — no create control, matches unchanged permissions.
    await expect(page.getByRole('button', { name: 'Nouvelle démarche' })).toHaveCount(0);
  });

  test('the "En attente de réponse" filter tab shows only matching procedures', async ({ page, request }) => {
    const token = await directorToken(request);
    const waitingTitle = unique('Démarche Filtre Attente');
    const otherTitle = unique('Démarche Filtre Autre');
    await apiCreateProcedure(request, token, {
      title: waitingTitle,
      status: 'EN_ATTENTE_REPONSE',
      pendingResponseOrganization: 'CAF',
    });
    await apiCreateProcedure(request, token, { title: otherTitle });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'En attente de réponse' }).click();

    await expect(page.getByText(waitingTitle)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(otherTitle)).toHaveCount(0);
  });

  test('editing a procedure whose status has already passed into the validation workflow (SOUMIS) keeps "Statut de suivi" read-only', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Statut Verrouillé');
    const created = await apiCreateProcedure(request, token, { title });
    await request.post(`${API_BASE}/administrative-procedures/${created.id}/submit-validation`, {
      headers: { Authorization: `Bearer ${token}` }, data: {},
    });
    const sToken = await supervisorToken(request);
    await request.patch(`${API_BASE}/administrative-procedures/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${sToken}` }, data: {},
    });
    // Real workflow, not a shortcut: submit-validation -> approve actually
    // moves procedure.status to SOUMIS (unlike validationStatus alone).

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    await page.getByText(title).click();
    await page.getByTestId('procedure-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('procedure-modal');
    await expect(modal.getByTestId('procedure-status-select')).toHaveCount(0);
    await expect(modal.getByText('Soumis — géré par le circuit de validation', { exact: false })).toBeVisible();

    // Saving an unrelated field (e.g. notes) still works and does not send
    // a status change that the backend would reject.
    await modal.locator('textarea').last().fill('Note ajoutée après approbation.');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('existing procedures created before this change remain unaffected (no organisme, no crash)', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Préexistante');
    await apiCreateProcedure(request, token, { title });

    await loginAsDirector(page);
    await page.goto('/app/demarches-administratives');
    await page.getByRole('button', { name: 'Toutes' }).click();
    const card = page.locator(`xpath=//p[text()="${title}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Organisme', { exact: false })).toHaveCount(0);

    await card.click();
    const detail = page.getByTestId('procedure-detail-modal');
    await expect(detail.getByText('À PRÉPARER', { exact: false })).toBeVisible();
    await expect(detail.getByText('Organisme concerné', { exact: false })).toHaveCount(0);
  });
});
