import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 11: Incident workflow improvements — EN_COURS/EN_ATTENTE/RESOLU statuses,
// N1/N2/N3 priority, the SECURITE category, real Child/StaffMember links,
// mandatory-note status history, search/filters, and the DIRECTOR-vs-
// SUPERVISOR permission split. Fixtures are created directly through the
// API for isolation; assertions run through the real IncidentsPage UI.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
const supervisorToken = (request: APIRequestContext) => apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);

async function apiCreateIncident(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/incidents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'AUTRE', description: 'Créé pour un test e2e.', signaledBy: 'E2E', priority: 'N3', ...data },
  });
  return res.json();
}

async function apiCreateSpace(request: APIRequestContext, token: string, name: string) {
  const res = await request.post(`${API_BASE}/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, type: 'INFIRMERIE' },
  });
  return res.json();
}

test.describe('Incidents — create (PR 11)', () => {
  test('DIRECTOR creates an incident through the form', async ({ page }) => {
    const title = unique('Chute cour');
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
    await modal.getByPlaceholder("Décrivez l'incident…").fill('Un enfant est tombé pendant la récréation.');
    await modal.getByRole('button', { name: 'Signaler' }).click();

    await expect(modal).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible();
  });

  test('description is required — Signaler stays disabled without one', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(unique('SansDescription'));
    await expect(modal.getByRole('button', { name: 'Signaler' })).toBeDisabled();
  });

  test('the SECURITE category is selectable and displayed', async ({ page }) => {
    const title = unique('Intrusion');
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
    await modal.getByPlaceholder("Décrivez l'incident…").fill('Personne non identifiée près du portail.');
    await modal.getByTestId('incident-category-select').selectOption('SECURITE');
    await modal.getByRole('button', { name: 'Signaler' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await expect(card.getByText('SÉCURITÉ')).toBeVisible();
  });

  for (const [priority, badge] of [['N1', 'N1'], ['N2', 'N2'], ['N3', 'N3']] as const) {
    test(`priority ${priority} is selectable and shown on the badge`, async ({ page }) => {
      const title = unique(`Priorite${priority}`);
      await loginAsDirector(page);
      await page.goto('/app/incidents');
      await page.getByRole('button', { name: 'Signaler un incident' }).click();

      const modal = page.getByTestId('incident-modal');
      await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
      await modal.getByPlaceholder("Décrivez l'incident…").fill('desc');
      await modal.getByTestId('incident-priority-select').selectOption(priority);
      await modal.getByRole('button', { name: 'Signaler' }).click();
      await expect(modal).toHaveCount(0, { timeout: 10_000 });

      const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
      await expect(card.getByText(badge, { exact: true })).toBeVisible();
    });
  }

  test('children and staff can be linked as persons concerned', async ({ page, request }) => {
    const token = await directorToken(request);
    const childRes = await request.post(`${API_BASE}/children`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fileNumber: unique('FN'), firstName: unique('Enfant'), lastName: 'E2E',
        dateOfBirth: '2015-01-01', placeOfBirth: 'Dakar', gender: 'FEMININ',
        entryDate: '2020-01-01', status: 'ORPHELIN_COMPLET',
      },
    });
    const child = await childRes.json();

    const title = unique('AvecPersonnes');
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
    await modal.getByPlaceholder("Décrivez l'incident…").fill('desc');
    await modal.getByPlaceholder('Rechercher un enfant…').fill(child.firstName);
    await modal.getByText(`${child.firstName} ${child.lastName}`).click();
    await modal.getByRole('button', { name: 'Signaler' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await card.click();
    await expect(page.getByText(`👶 ${child.firstName} ${child.lastName}`)).toBeVisible({ timeout: 10_000 });
  });

  test('an existing space (Locaux et espaces) can be linked as a location concerned', async ({ page, request }) => {
    const token = await directorToken(request);
    const space = await apiCreateSpace(request, token, unique('Infirmerie'));

    const title = unique('AvecLocal');
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
    await modal.getByPlaceholder("Décrivez l'incident…").fill('desc');
    await modal.getByPlaceholder('Rechercher un local…').fill(space.name);
    await modal.getByText(space.name).click();
    await modal.getByRole('button', { name: 'Signaler' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await card.click();
    await expect(page.getByText(`🏠 ${space.name}`)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Incidents — status change (PR 11)', () => {
  test('a note is mandatory to change status, and the history records it', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('StatusChange');
    await apiCreateIncident(request, token, { title });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.getByRole('button', { name: 'Changer le statut' }).click();
    const statusModal = page.getByTestId('status-change-modal');
    await expect(statusModal.getByRole('button', { name: 'Valider' })).toBeDisabled();

    await statusModal.getByPlaceholder('Expliquez ce changement de statut…').fill('En attente du médecin.');
    await expect(statusModal.getByRole('button', { name: 'Valider' })).toBeEnabled();
    await statusModal.getByRole('button', { name: 'Valider' }).click();
    await expect(statusModal).toHaveCount(0, { timeout: 10_000 });

    const detail = page.getByTestId('incident-detail-modal');
    // The history entry alone proves both the new status and the note were
    // recorded — a separate status-badge assertion would be ambiguous since
    // "En attente" also appears inside this same history line.
    await expect(detail.getByText('En cours → En attente')).toBeVisible();
    await expect(detail.getByText('En attente du médecin.')).toBeVisible();
  });
});

test.describe('Incidents — search and filters (PR 11)', () => {
  test('text search filters the list by title', async ({ page, request }) => {
    const token = await directorToken(request);
    const titleA = unique('Fuite');
    const titleB = unique('Conflit');
    await apiCreateIncident(request, token, { title: titleA });
    await apiCreateIncident(request, token, { title: titleB });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByPlaceholder('Rechercher un incident…').fill(titleA);
    await expect(page.getByText(titleA)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(titleB)).toHaveCount(0);
  });

  test('priority filter narrows the list', async ({ page, request }) => {
    const token = await directorToken(request);
    const titleN1 = unique('UrgentN1');
    const titleN3 = unique('NormalN3');
    await apiCreateIncident(request, token, { title: titleN1, priority: 'N1' });
    await apiCreateIncident(request, token, { title: titleN3, priority: 'N3' });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByPlaceholder('Rechercher un incident…').fill('');
    await page.getByTestId('filter-priority').selectOption('N1');
    await expect(page.getByText(titleN1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(titleN3)).toHaveCount(0);
  });

  test('category filter narrows the list to SECURITE', async ({ page, request }) => {
    const token = await directorToken(request);
    const titleSec = unique('IncidentSecu');
    const titleAutre = unique('IncidentAutre');
    await apiCreateIncident(request, token, { title: titleSec, type: 'SECURITE' });
    await apiCreateIncident(request, token, { title: titleAutre, type: 'AUTRE' });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByTestId('filter-category').selectOption('SECURITE');
    await expect(page.getByText(titleSec)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(titleAutre)).toHaveCount(0);
  });

  test('location filter narrows the list to incidents linked to that space', async ({ page, request }) => {
    const token = await directorToken(request);
    const space = await apiCreateSpace(request, token, unique('Cuisine'));
    const titleWithSpace = unique('IncidentAvecLocal');
    const titleWithoutSpace = unique('IncidentSansLocal');
    await apiCreateIncident(request, token, { title: titleWithSpace, spaceIds: [space.id] });
    await apiCreateIncident(request, token, { title: titleWithoutSpace });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await page.getByTestId('filter-location').selectOption(space.id);
    await expect(page.getByText(titleWithSpace)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(titleWithoutSpace)).toHaveCount(0);
  });
});

test.describe('Incidents — SUPERVISOR permissions (PR 11)', () => {
  test('SUPERVISOR can create an incident but has no edit/status controls afterwards', async ({ page }) => {
    const title = unique('SupervisorCreates');
    await loginAsSupervisor(page);
    await page.goto('/app/incidents');
    await page.getByRole('button', { name: 'Signaler un incident' }).click();

    const modal = page.getByTestId('incident-modal');
    await modal.getByPlaceholder('Ex : Conflit en cour').fill(title);
    await modal.getByPlaceholder("Décrivez l'incident…").fill('desc');
    await modal.getByRole('button', { name: 'Signaler' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible();
    // No pencil/trash icon buttons on the card for a SUPERVISOR.
    await expect(card.getByTitle('Modifier')).toHaveCount(0);
    await expect(card.getByTitle('Supprimer')).toHaveCount(0);

    await card.click();
    await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Changer le statut' })).toHaveCount(0);
  });

  test('a SUPERVISOR-created incident is clearly highlighted', async ({ page, request }) => {
    const token = await supervisorToken(request);
    const title = unique('HighlightMe');
    await apiCreateIncident(request, token, { title });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('SUPERVISEUR')).toBeVisible();
  });
});

test.describe('Incidents — attachments (PR 11)', () => {
  test('an attachment can still be uploaded and reopened from the detail view', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('AvecPieceJointe');
    await apiCreateIncident(request, token, { title });

    await loginAsDirector(page);
    await page.goto('/app/incidents');
    const card = page.locator('[data-testid^="incident-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTitle('Modifier').click();

    const modal = page.getByTestId('incident-modal');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      modal.getByText('Joindre une photo ou un document…').click(),
    ]);
    await fileChooser.setFiles({ name: 'preuve.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    await card.click();
    await expect(page.getByRole('button', { name: 'Pièce jointe' })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Incidents — mobile layout (PR 11)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('IncidentsPage has no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/incidents');
    await expect(page.getByRole('heading', { name: 'Suivi des incidents' })).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
