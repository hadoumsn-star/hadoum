import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 3: Maintenance Tickets <-> Contact directory integration. Drives the
// real app against the real backend (see playwright.config.ts). Fixture
// contacts/tickets are created directly through the Contact/Maintenance
// Ticket APIs via Playwright's `request` fixture for setup only — every
// assertion about ContactAutocomplete/legacy-ticket/inactive-contact
// behavior is driven through the actual TicketsMaintenancePage UI.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}

async function directorToken(request: APIRequestContext): Promise<string> {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
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

async function apiListSpaces(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function apiCreateTicket(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/maintenance-tickets`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

// "Tickets de maintenance" was removed from Administration & Locaux
// (Director/Supervisor menu simplification) and /app/tickets-maintenance
// now redirects to /app/administration for everyone — TicketsMaintenancePage,
// its backend module/API, and this whole suite are preserved for reuse
// once/if the route is wired back up; skipped rather than deleted so
// nothing here needs rewriting when that happens.
test.describe.skip('Maintenance Tickets — Contact assignment (PR 3)', () => {
  test('DIRECTOR opens the new ticket form and sees ContactAutocomplete scoped to relevant categories', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();

    const modal = page.getByTestId('ticket-modal');
    const provider = modal.getByLabel('Prestataire assigné');
    await expect(provider).toBeVisible();
    await provider.click();

    await expect(page.getByRole('button', { name: 'Maintenance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prestataire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Artisan' })).toBeVisible();
    // Restricted: a category outside the ticket's set shouldn't appear as a chip.
    await expect(page.getByRole('button', { name: 'Santé' })).toHaveCount(0);
  });

  test('search and select an existing provider, then clear the selection', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const maintenance = categories.find((c: { key: string }) => c.key === 'MAINTENANCE');
    const providerName = unique('Prestataire Recherche');
    await apiCreateContact(request, token, { fullName: providerName, categoryId: maintenance.id });

    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();

    const modal = page.getByTestId('ticket-modal');
    const provider = modal.getByLabel('Prestataire assigné');
    await provider.fill(providerName);
    await page.getByRole('option', { name: new RegExp(providerName) }).click();
    await expect(provider).toHaveValue(providerName);

    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await expect(provider).toHaveValue('');
  });

  test('inline creation of a new provider auto-selects it, and the ticket saves with it', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();

    const modal = page.getByTestId('ticket-modal');
    const title = unique('Ticket Inline');
    await modal.getByPlaceholder("Ex : Fuite d'eau salle de bain").fill(title);

    const providerName = unique('Nouveau Prestataire');
    const provider = modal.getByLabel('Prestataire assigné');
    await provider.fill(providerName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    const contactModal = page.getByTestId('contact-form-modal');
    await expect(contactModal.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(contactModal.locator('#contact-form-fullName')).toHaveValue(providerName);
    await contactModal.locator('#contact-form-categoryId').selectOption({ label: 'Maintenance' });
    await contactModal.getByRole('button', { name: 'Créer' }).click();

    await expect(contactModal).toHaveCount(0);
    await expect(provider).toHaveValue(providerName);

    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(new RegExp(providerName))).toBeVisible();
  });

  test('editing a legacy assignedTo-only ticket shows the legacy notice, which disappears once a real Contact is selected', async ({ page, request }) => {
    const token = await directorToken(request);
    const spaces = await apiListSpaces(request, token);
    const categories = await apiListCategories(request, token);
    const maintenance = categories.find((c: { key: string }) => c.key === 'MAINTENANCE');
    const title = unique('Ticket Legacy');
    const legacyName = 'Prestataire historique (texte libre)';
    await apiCreateTicket(request, token, {
      title, spaceId: spaces[0].id, urgency: 'MOYENNE', reportedBy: 'Test Director', assignedTo: legacyName,
    });
    const replacementName = unique('Remplacement Prestataire');
    await apiCreateContact(request, token, { fullName: replacementName, categoryId: maintenance.id });

    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByText(title).click();
    await page.getByTestId('ticket-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('ticket-modal');
    await expect(page.getByText(`Prestataire actuel : ${legacyName} — non lié au répertoire`)).toBeVisible();

    const provider = modal.getByLabel('Prestataire assigné');
    await provider.fill(replacementName);
    await page.getByRole('option', { name: new RegExp(replacementName) }).click();

    await expect(page.getByText(`Prestataire actuel : ${legacyName} — non lié au répertoire`)).toHaveCount(0);

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(new RegExp(replacementName))).toBeVisible();
  });

  test('an inactive referenced Contact is visible on the ticket but cannot be newly selected', async ({ page, request }) => {
    const token = await directorToken(request);
    const spaces = await apiListSpaces(request, token);
    const categories = await apiListCategories(request, token);
    const maintenance = categories.find((c: { key: string }) => c.key === 'MAINTENANCE');
    const inactiveName = unique('Prestataire Inactif');
    const contact = await apiCreateContact(request, token, { fullName: inactiveName, categoryId: maintenance.id });
    const title = unique('Ticket Inactif');
    // Link while still active — a new assignment to an already-inactive
    // contact is correctly rejected by the backend (see
    // MaintenanceTicketsService.assertContactAssignable), so the realistic
    // fixture is "assigned, then deactivated later", not the other way round.
    await apiCreateTicket(request, token, {
      title, spaceId: spaces[0].id, urgency: 'MOYENNE', reportedBy: 'Test Director', assignedContactId: contact.id,
    });
    await apiDeactivateContact(request, token, contact.id);

    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByText(title).click();
    await page.getByTestId('ticket-detail-modal').getByRole('button', { name: 'Modifier' }).click();

    const modal = page.getByTestId('ticket-modal');
    await expect(modal.getByLabel('Prestataire assigné')).toHaveValue(inactiveName);
    await expect(page.getByText('CONTACT INACTIF', { exact: true })).toBeVisible();

    // Searching from scratch never surfaces an inactive contact for a *new* pick.
    await modal.getByRole('button', { name: 'Effacer la sélection' }).click();
    await modal.getByLabel('Prestataire assigné').fill(inactiveName);
    await expect(page.getByRole('option', { name: new RegExp(inactiveName) })).toHaveCount(0);
  });

  test('SUPERVISOR permissions are unchanged: no create control, tickets remain read-only', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/tickets-maintenance');
    await expect(page.getByRole('button', { name: 'Nouveau ticket' })).toHaveCount(0);
  });

  test('the ticket form remains usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();

    const modal = page.getByTestId('ticket-modal');
    await expect(modal.getByLabel('Prestataire assigné')).toBeVisible();
    const box = await modal.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });
});
