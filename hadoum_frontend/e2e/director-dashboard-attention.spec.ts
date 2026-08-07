import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector } from './helpers';

// Director Dashboard reorder + new "Demandes à traiter" section: Quick
// Actions is now the first content block below the header, immediately
// followed by "Demandes à traiter" — active incidents (status !== RESOLU;
// there is no "archived" incident status in this system) prioritized
// supervisor-created-first, then newest first. Reuses the existing,
// unmodified GET /incidents endpoint and IncidentsPage's own DetailModal
// (via /app/incidents?open=<id>) — no new backend route, no second detail
// screen. See director-dashboard.spec.ts for the pre-existing Finance/
// Présence/Activité récente coverage, unaffected by this reorder (their
// relative order to each other is unchanged; only Quick Actions moved
// above them and this new section was inserted).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
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
async function apiChangeStatus(request: APIRequestContext, token: string, id: string, status: string) {
  await request.patch(`${API_BASE}/incidents/${id}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status, note: 'Résolution e2e.' },
  });
}

function attentionCard(page: import('@playwright/test').Page, title: string) {
  return page.locator(`xpath=//p[text()="${title}"]/ancestor::div[@data-testid][starts-with(@data-testid,"attention-incident-")][1]`);
}

test.describe('Director Dashboard — layout order', () => {
  test('Quick Actions is the first content block below the header, immediately followed by Demandes à traiter', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const quickActions = page.getByTestId('quick-action-add-child');
    await expect(quickActions).toBeVisible({ timeout: 10_000 });
    const demandes = page.getByTestId('demandes-a-traiter').or(page.getByTestId('demandes-a-traiter-empty'));
    await expect(demandes).toBeVisible({ timeout: 10_000 });
    const finance = page.getByTestId('finance-kpis');
    await expect(finance).toBeVisible();

    const quickActionsBox = await quickActions.boundingBox();
    const demandesBox = await demandes.boundingBox();
    const financeBox = await finance.boundingBox();
    expect(quickActionsBox).not.toBeNull();
    expect(demandesBox).not.toBeNull();
    expect(financeBox).not.toBeNull();

    // Quick Actions above Demandes à traiter, which is above Finance —
    // i.e. Quick Actions is the first block, Demandes à traiter is
    // immediately next, both ahead of everything that used to lead the
    // page (Finance/Présence/Activité récente keep their own relative
    // order, unaffected — see director-dashboard.spec.ts).
    expect(quickActionsBox!.y).toBeLessThan(demandesBox!.y);
    expect(demandesBox!.y).toBeLessThan(financeBox!.y);
  });
});

test.describe('Director Dashboard — Demandes à traiter', () => {
  test('shows only active incidents (not RESOLU), with supervisor-created ones first and newest-first within each group', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);

    // Order of creation: director-old, supervisor-old, director-new,
    // supervisor-new — expected render order is supervisor-new,
    // supervisor-old, director-new, director-old (supervisor group first,
    // newest first within each group).
    const directorOld = unique('Incident Director Ancien');
    await apiCreateIncident(request, dToken, { title: directorOld });
    const supervisorOld = unique('Incident Supervisor Ancien');
    await apiCreateIncident(request, sToken, { title: supervisorOld });
    const directorNew = unique('Incident Director Récent');
    await apiCreateIncident(request, dToken, { title: directorNew });
    const supervisorNew = unique('Incident Supervisor Récent');
    await apiCreateIncident(request, sToken, { title: supervisorNew });

    // A resolved incident from a supervisor must NOT appear, despite
    // otherwise sorting first — status filtering wins over the sort.
    const resolvedSupervisor = unique('Incident Supervisor Résolu');
    const resolved = await apiCreateIncident(request, sToken, { title: resolvedSupervisor });
    await apiChangeStatus(request, sToken, resolved.id, 'RESOLU');

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const section = page.getByTestId('demandes-a-traiter');
    await expect(section).toBeVisible({ timeout: 10_000 });

    await expect(section.getByText(resolvedSupervisor)).toHaveCount(0);

    const titles = [supervisorNew, supervisorOld, directorNew, directorOld];
    const indices = await Promise.all(titles.map(async t => {
      const card = attentionCard(page, t);
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      return box!.y;
    }));
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
  });

  test('a supervisor-created card shows the "Créé par le superviseur" badge; a director-created one does not', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const sToken = await supervisorToken(request);
    const directorTitle = unique('Incident Badge Director');
    const supervisorTitle = unique('Incident Badge Supervisor');
    await apiCreateIncident(request, dToken, { title: directorTitle });
    await apiCreateIncident(request, sToken, { title: supervisorTitle });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('demandes-a-traiter')).toBeVisible({ timeout: 10_000 });

    const supervisorCard = attentionCard(page, supervisorTitle);
    await expect(supervisorCard).toBeVisible();
    await expect(supervisorCard.getByText('Créé par le superviseur')).toBeVisible();

    const directorCard = attentionCard(page, directorTitle);
    await expect(directorCard).toBeVisible();
    await expect(directorCard.getByText('Créé par le superviseur')).toHaveCount(0);
  });

  test('each card shows priority badge, status, created by, creation date, concerned entities and a description preview', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const spaceRes = await request.post(`${API_BASE}/spaces`, {
      headers: { Authorization: `Bearer ${dToken}` }, data: { name: unique('Local E2E'), type: 'INFIRMERIE' },
    });
    const space = await spaceRes.json();
    const title = unique('Incident Détails Carte');
    await apiCreateIncident(request, dToken, {
      title, priority: 'N1', description: 'Description détaillée pour la carte du tableau de bord.', spaceIds: [space.id],
    });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const card = attentionCard(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText('N1')).toBeVisible();
    await expect(card.getByText('EN COURS')).toBeVisible();
    await expect(card.getByText(/Créé par /)).toBeVisible();
    await expect(card.getByText('1 local')).toBeVisible();
    await expect(card.getByText('Description détaillée pour la carte du tableau de bord.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Voir' })).toBeVisible();
  });

  test('empty state shows "Aucune demande en cours." when there are no active incidents', async ({ page }) => {
    // Deterministic via a mocked response — the shared dev DB accumulates
    // fixture incidents from every other e2e spec, so a real zero can't be
    // relied on; this still exercises the exact same rendering path a
    // genuine zero would (same convention as director-dashboard.spec.ts's
    // own empty-state test for the "Non confirmées" modal).
    await page.route('**/incidents', route => route.fulfill({ json: [] }));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const empty = page.getByTestId('demandes-a-traiter-empty');
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty.getByText('Aucune demande en cours.')).toBeVisible();
    await expect(page.getByTestId('demandes-a-traiter')).toHaveCount(0);
  });

  test('"Voir" opens the correct incident in the existing Incident detail modal, not a new screen', async ({ page, request }) => {
    const dToken = await directorToken(request);
    const title = unique('Incident Voir Dashboard');
    const created = await apiCreateIncident(request, dToken, { title, description: 'Ouverture depuis le tableau de bord.' });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const card = attentionCard(page, title);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Voir' }).click();

    await expect(page).toHaveURL(/\/app\/incidents\?open=/);
    // The exact same DetailModal component IncidentsPage already renders
    // for its own "Voir" button — not a bespoke dashboard detail view.
    const detail = page.getByTestId('incident-detail-modal');
    await expect(detail).toBeVisible({ timeout: 10_000 });
    await expect(detail.getByText(title)).toBeVisible();
    await expect(detail.getByText('Ouverture depuis le tableau de bord.')).toBeVisible();

    // The deep-link param is consumed, not left dangling in the URL.
    await expect(page).toHaveURL('/app/incidents');
    expect(created.id).toBeTruthy();
  });
});

test.describe('Director Dashboard — Demandes à traiter mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders with no horizontal overflow on mobile', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Incident Mobile Dashboard');
    await apiCreateIncident(request, token, { title });

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(attentionCard(page, title)).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
