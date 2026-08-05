import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// Supervisor validation experience consistency: one shared
// <PendingValidationsList /> component (src/app/components/validations)
// renders both /app/validations (the full page) and the Supervisor
// Dashboard's own "Demandes à valider" section — same fetch
// (GET /validations/pending), same per-resource-type adaptive cards, same
// generic approve/reject dispatch (to each resource's own existing
// endpoint, never a new one). This file covers what's specific to that
// consistency: the Administrative Procedure responsible-contact display,
// the "Demandes à valider" title everywhere, mixed resource types on one
// list, and approve/reject now working for resource types beyond expenses
// on this page. Expense-specific coverage stays in validations-page.spec.ts
// and supervisor-dashboard-finance-widget.spec.ts (same component, not
// duplicated here); Contact-relation/threshold specifics for each resource
// type stay on that resource's own dedicated e2e suite.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

async function apiCreateContact(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/contacts?force=true`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

async function apiListCategories(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/contacts/categories`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function apiCreateProcedure(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/administrative-procedures`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: unique('Démarche E2E'), procedureType: 'AGREMENT', authority: 'Ministère de la Famille', ...data },
  });
  return res.json();
}

async function apiSubmitProcedure(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/administrative-procedures/${id}/submit-validation`, {
    headers: { Authorization: `Bearer ${token}` }, data: {},
  });
}

async function apiListSpaces(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/spaces`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function apiCreateTicket(request: APIRequestContext, token: string, spaceId: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/maintenance-tickets`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: unique('Ticket E2E'), spaceId, urgency: 'MOYENNE', reportedBy: 'Test Director', ...data },
  });
  return res.json();
}

async function apiSubmitTicket(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/maintenance-tickets/${id}/submit-validation`, {
    headers: { Authorization: `Bearer ${token}` }, data: {},
  });
}

async function apiCreateContract(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/supplier-contracts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      contractName: unique('Contrat E2E'),
      supplierName: 'Fournisseur E2E',
      category: 'ELECTRICITE',
      startDate: '2026-01-01',
      ...data,
    },
  });
  return res.json();
}

async function apiCreateExpense(request: APIRequestContext, token: string, data: Record<string, unknown> = {}) {
  const res = await request.post(`${API_BASE}/finances/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'DEPENSE', category: 'ENTRETIEN', label: unique('Dépense E2E'), amountXof: 12000, date: '2026-06-15', ...data },
  });
  return res.json();
}
async function apiSubmitExpense(request: APIRequestContext, token: string, id: string) {
  await request.post(`${API_BASE}/finances/transactions/${id}/submit`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
}

// Works for either variant's DOM shape (<div class="rounded-xl"> on the page,
// <li> on the dashboard) — scoped by the item's own title/name text.
function pendingCardByText(page: Page, text: string) {
  return page.locator(`xpath=//p[text()="${text}"]/ancestor::*[self::div[contains(@class,"rounded-xl")] or self::li][1]`);
}

test.describe('Administrative Procedures — responsible Contact on the Supervisor validation page', () => {
  test('shows the linked Contact as the responsible, not the legacy free-text field', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const admin = categories.find((c: { key: string }) => c.key === 'ADMINISTRATION') ?? categories[0];
    const contactName = unique('Responsable E2E');
    const contact = await apiCreateContact(request, token, { fullName: contactName, categoryId: admin.id });
    const title = unique('Agrément Responsable E2E');
    const created = await apiCreateProcedure(request, token, { title, assignedContactId: contact.id });
    await apiSubmitProcedure(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCardByText(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(contactName)).toBeVisible();
  });

  test('shows "Aucun responsable" when no Contact is assigned', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Agrément Sans Responsable E2E');
    const created = await apiCreateProcedure(request, token, { title });
    await apiSubmitProcedure(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCardByText(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Aucun responsable')).toBeVisible();
  });
});

test.describe('Supervisor validation experience — "Demandes à valider" everywhere', () => {
  test('the full page and the Supervisor Dashboard both title the section "Demandes à valider"', async ({ page }) => {
    await loginAsSupervisor(page);

    // Both the AppLayout page-title <h1> (breadcrumb bar, from PAGE_TITLES)
    // and the PendingValidationsList's own <h2> read "Demandes à valider"
    // on this page — scope to the h2 to avoid a strict-mode collision, the
    // h1 is exercised by the sidebar-link test below instead.
    await page.goto('/app/validations');
    await expect(page.getByRole('heading', { name: 'Demandes à valider', level: 2 })).toBeVisible({ timeout: 10_000 });

    await page.goto('/app/dashboard');
    await expect(page.getByTestId('supervisor-dashboard').getByRole('heading', { name: 'Demandes à valider' })).toBeVisible({ timeout: 10_000 });
  });

  test('the Finance page keeps its own "Demandes à valider" section for expenses', async ({ page, request }) => {
    const token = await directorToken(request);
    const label = unique('Dépense Finance Titre E2E');
    const created = await apiCreateExpense(request, token, { label });
    await apiSubmitExpense(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    await expect(page.getByRole('heading', { name: 'Demandes à valider' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Dépenses à valider')).toHaveCount(0);
  });

  test('the Supervisor Dashboard reachable via the sidebar link "Demandes à valider"', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await page.getByRole('link', { name: 'Demandes à valider' }).click();
    await expect(page).toHaveURL(/\/app\/validations$/);
    // The AppLayout breadcrumb <h1> for this route confirms the sidebar
    // link's own destination title; the list's own <h2> is covered above.
    await expect(page.getByRole('heading', { name: 'Demandes à valider', level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Supervisor validation experience — mixed resource types on one list', () => {
  test('an expense, a supplier contract, an administrative procedure and a maintenance ticket all display with their own adapted fields', async ({ page, request }) => {
    const token = await directorToken(request);

    const expenseLabel = unique('Dépense Mixte E2E');
    const expense = await apiCreateExpense(request, token, { label: expenseLabel, category: 'ENTRETIEN', amountXof: 34000 });
    await apiSubmitExpense(request, token, expense.id);

    const contractName = unique('Contrat Mixte E2E');
    await apiCreateContract(request, token, {
      contractName, supplierName: 'SDE', endDate: '2027-01-01',
    });

    const procedureTitle = unique('Démarche Mixte E2E');
    const procedure = await apiCreateProcedure(request, token, { title: procedureTitle, authority: 'Préfecture de Dakar' });
    await apiSubmitProcedure(request, token, procedure.id);

    const spaces = await apiListSpaces(request, token);
    const ticketTitle = unique('Ticket Mixte E2E');
    const ticket = await apiCreateTicket(request, token, spaces[0].id, { title: ticketTitle, urgency: 'ELEVEE' });
    await apiSubmitTicket(request, token, ticket.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');

    const expenseCard = pendingCardByText(page, expenseLabel);
    await expect(expenseCard).toBeVisible({ timeout: 10_000 });
    await expect(expenseCard.getByText('34 000 FCFA', { exact: false })).toBeVisible();
    await expect(expenseCard.getByText('Entretien', { exact: false })).toBeVisible();

    const contractCard = pendingCardByText(page, contractName);
    await expect(contractCard).toBeVisible();
    await expect(contractCard.getByText('SDE', { exact: false })).toBeVisible();
    await expect(contractCard.getByText('Fin : 01/01/2027', { exact: false })).toBeVisible();

    const procedureCard = pendingCardByText(page, procedureTitle);
    await expect(procedureCard).toBeVisible();
    await expect(procedureCard.getByText('Préfecture de Dakar', { exact: false })).toBeVisible();

    const ticketCard = pendingCardByText(page, ticketTitle);
    await expect(ticketCard).toBeVisible();
    await expect(ticketCard.getByText('Élevée', { exact: false })).toBeVisible();
  });
});

test.describe('Supervisor validation experience — Approve/Reject for non-expense resource types', () => {
  test('approves a pending Supplier Contract from the unified list; it becomes ACTIF', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Approve E2E');
    const created = await apiCreateContract(request, token, { contractName });

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCardByText(page, contractName);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Approuver' }).click();

    const modal = page.getByTestId('generic-decision-modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });
    await expect(pendingCardByText(page, contractName)).toHaveCount(0);

    const detail = await request.get(`${API_BASE}/supplier-contracts/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    expect(detail.status).toBe('ACTIF');
  });

  test('rejects a pending Administrative Procedure from the unified list; comment is mandatory', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Refus E2E');
    const created = await apiCreateProcedure(request, token, { title });
    await apiSubmitProcedure(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    const card = pendingCardByText(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Refuser' }).click();

    const modal = page.getByTestId('generic-decision-modal');
    await expect(modal).toBeVisible();
    const confirmButton = modal.getByRole('button', { name: 'Refuser' });
    await expect(confirmButton).toBeDisabled();
    await modal.getByPlaceholder('Expliquez votre décision…').fill('Dossier incomplet');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });
    await expect(pendingCardByText(page, title)).toHaveCount(0);

    const detail = await request.get(`${API_BASE}/administrative-procedures/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    expect(detail.validationStatus).toBe('REJECTED');
  });

  test('approves a pending Maintenance Ticket from the Supervisor Dashboard\'s own list, with automatic refresh', async ({ page, request }) => {
    const token = await directorToken(request);
    const spaces = await apiListSpaces(request, token);
    const title = unique('Ticket Approve Dashboard E2E');
    const created = await apiCreateTicket(request, token, spaces[0].id, { title });
    await apiSubmitTicket(request, token, created.id);

    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const card = pendingCardByText(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Approuver' }).click();
    await page.getByTestId('generic-decision-modal').getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByText('Décision enregistrée.')).toBeVisible({ timeout: 10_000 });

    // Auto-refresh: gone from the dashboard's own list without a reload.
    await expect(page.getByTestId('supervisor-dashboard').getByText(title)).toHaveCount(0);

    const detail = await request.get(`${API_BASE}/maintenance-tickets/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    expect(detail.validationStatus).toBe('APPROVED');
  });

  test('DIRECTOR sees the same pending items read-only: no Approuver/Refuser on any resource type', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Démarche Lecture Seule E2E');
    const created = await apiCreateProcedure(request, token, { title });
    await apiSubmitProcedure(request, token, created.id);

    await loginAsDirector(page);
    await page.goto('/app/validations');
    const card = pendingCardByText(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
  });
});

test.describe('Supervisor validation experience — mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the unified list has no horizontal overflow with mixed resource types', async ({ page, request }) => {
    const token = await directorToken(request);
    const contractName = unique('Contrat Mobile Mixte E2E');
    await apiCreateContract(request, token, { contractName });
    const title = unique('Démarche Mobile Mixte E2E');
    const proc = await apiCreateProcedure(request, token, { title });
    await apiSubmitProcedure(request, token, proc.id);

    await loginAsSupervisor(page);
    await page.goto('/app/validations');
    await expect(pendingCardByText(page, contractName)).toBeVisible({ timeout: 10_000 });
    await expect(pendingCardByText(page, title)).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
