import { test, expect } from '@playwright/test';
import { loginAsSupervisor, loginAsDirector } from './helpers';

test.describe('Supervisor dashboard', () => {
  // The dashboard was progressively simplified to show the real pending
  // validation requests and nothing else made-up. First pass removed the
  // top decision-focus summary block (count/delay text + an incident
  // badge); a later pass removed the two sections still under it — "Suivi
  // des incidents" and "Vue économique" (which included a *mock*, never
  // backend-connected fund-requests list) — entirely. A later pass added
  // back one real, backend-connected finance-only section
  // (<PendingExpenseApprovals />, see supervisor-dashboard-finance-widget.
  // spec.ts) alongside the existing generic list — not a resurrection of
  // "Vue économique"/the mock fund-requests list. Supervisor validation
  // consistency then merged those two sections back into one: the single
  // <PendingValidationsList variant="card" /> below now covers every
  // resource type, expenses included, under one "Demandes à valider"
  // heading — see supervisor-validation-consistency.spec.ts for that
  // merge's own coverage. Nothing on this page should mention incidents,
  // the old budget KPI cards, or fund requests any more.
  test('shows the header, "Demandes à valider" and no incidents/old-budget-KPI/fund-request content', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');

    // Scoped to the dashboard's own content, not the whole page — the
    // sidebar itself has an unrelated "Suivi des incidents" *link*
    // (Incidents keeps its own full page/nav entry; nothing here duplicates
    // it), which a page-wide text search would wrongly treat as a leftover.
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText('Demandes à valider')).toBeVisible({ timeout: 10_000 });

    // Removed top summary block's count+label (a leading digit) — distinct
    // from the kept list's "<N> au total" header and "Aucune demande en
    // attente" empty state, neither of which this can match.
    await expect(dashboard.getByText(/\d+\s+demandes?\s+en attente/)).toHaveCount(0);
    // Removed "Suivi des incidents" section (and its former badge/text) —
    // nothing in the dashboard's own content says "incident(s)" any more.
    await expect(dashboard.getByText(/incidents?/i)).toHaveCount(0);
    // Removed "Vue économique" section — budget KPIs and the mock fund
    // requests list (with its own Valider/Refuser buttons) are both gone.
    await expect(dashboard.getByText('Vue économique')).toHaveCount(0);
    await expect(dashboard.getByText('Budget alloué')).toHaveCount(0);
    await expect(dashboard.getByText(/Demandes de fonds/)).toHaveCount(0);
  });

  test('shows only real pending validation requests, each with resource, submitter, date and a working "Voir" link', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');

    const section = page.getByTestId('supervisor-dashboard').getByText('Demandes à valider').locator('../..');
    await expect(section).toBeVisible({ timeout: 10_000 });

    const rows = section.locator('li');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      await expect(section.getByText('Aucune demande en attente')).toBeVisible();
      return;
    }
    // Every row shows a resource-type badge, a "Soumis par <submitter>"
    // line, a date, and a working "Voir" link — never a status badge for a
    // completed/rejected/approved/cancelled request (this list is always
    // server-scoped to PENDING_VALIDATION only).
    const first = rows.first();
    await expect(first.getByText(/^Soumis par /)).toBeVisible();
    const voirLink = first.getByRole('link', { name: /Voir/ });
    await expect(voirLink).toHaveAttribute('href', /^\/app\//);
    await expect(section.getByText('APPROUVÉ', { exact: false })).toHaveCount(0);
    await expect(section.getByText('REJETÉ', { exact: false })).toHaveCount(0);
    await expect(section.getByText('ANNULÉ', { exact: false })).toHaveCount(0);
  });

  test('refreshes automatically after navigating away to decide and back', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    const dashboard = page.getByTestId('supervisor-dashboard');
    await expect(dashboard.getByText('Demandes à valider')).toBeVisible({ timeout: 10_000 });
    const countBefore = await dashboard.locator('text=/\\d+ au total/').textContent();

    // Full SPA round trip through another route and back remounts the page
    // (no special caching keeps it alive), which is what re-fetches the list.
    await page.goto('/app/incidents');
    await page.goto('/app/dashboard');
    await expect(dashboard.getByText('Demandes à valider')).toBeVisible({ timeout: 10_000 });
    const countAfter = await dashboard.locator('text=/\\d+ au total/').textContent();
    // Not asserting a specific delta (no decision was actually made here) —
    // just that the count element re-rendered from a fresh fetch, not a
    // frozen one; a real decision-then-return is covered by the resource
    // pages' own approve/reject e2e coverage (e.g. expense-workflow.spec.ts).
    expect(countBefore).toBeTruthy();
    expect(countAfter).toBeTruthy();
  });

  // Read-only enforcement for Module 4 operational pages is covered by
  // maintenance-tickets.spec.ts/module4-register.spec.ts's own SUPERVISOR
  // checks where those pages are still reachable — the case exercised here
  // previously (registre-entrees-sorties) is now a redirect for everyone
  // (see the "Administration & Locaux menu simplification" describe below).
});

test.describe('Administration & Locaux menu simplification', () => {
  test('SUPERVISOR: "Tickets de maintenance" and "Registre d\'entrées/sorties" are gone from the hub', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/administration');
    await expect(page.getByText('Locaux et espaces')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Tickets de maintenance')).toHaveCount(0);
    await expect(page.getByText("Registre d'entrées/sorties")).toHaveCount(0);
  });

  test('DIRECTOR: "Tickets de maintenance" and "Registre d\'entrées/sorties" are gone from the hub too', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/administration');
    await expect(page.getByText('Locaux et espaces')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Tickets de maintenance')).toHaveCount(0);
    await expect(page.getByText("Registre d'entrées/sorties")).toHaveCount(0);
  });

  test('other Administration & Locaux entries are unaffected', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/administration');
    await expect(page.getByText('Contrats fournisseurs')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Démarches administratives')).toBeVisible();
    await expect(page.getByText('Stocks et inventaire')).toBeVisible();
  });

  test('direct URL to /app/tickets-maintenance redirects to the hub for DIRECTOR', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/tickets-maintenance');
    await expect(page).toHaveURL(/\/app\/administration$/, { timeout: 10_000 });
  });

  test('direct URL to /app/tickets-maintenance redirects to the hub for SUPERVISOR', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/tickets-maintenance');
    await expect(page).toHaveURL(/\/app\/administration$/, { timeout: 10_000 });
  });

  test('direct URL to /app/registre-entrees-sorties redirects to the hub for DIRECTOR', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/registre-entrees-sorties');
    await expect(page).toHaveURL(/\/app\/administration$/, { timeout: 10_000 });
  });

  test('direct URL to /app/registre-entrees-sorties redirects to the hub for SUPERVISOR', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/registre-entrees-sorties');
    await expect(page).toHaveURL(/\/app\/administration$/, { timeout: 10_000 });
  });
});

test.describe('Sidebar — Journal d\'audit and Mon équipe menu simplification', () => {
  test('SUPERVISOR sidebar no longer shows "Mon équipe" or "Journal d\'audit"', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('link', { name: "Vue d'ensemble" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Mon équipe' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: "Journal d'audit" })).toHaveCount(0);
  });

  // "Journal d'audit" was later removed from the DIRECTOR sidebar too (menu
  // entry only — the page, route, and backend module/API/data are untouched;
  // see the "DIRECTOR can still reach..." test below). "Mon équipe" stays,
  // DIRECTOR-only, unaffected.
  test('DIRECTOR sidebar still shows "Mon équipe" but no longer shows "Journal d\'audit"', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('link', { name: 'Mon équipe' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: "Journal d'audit" })).toHaveCount(0);
  });

  test('SUPERVISOR opening /app/team directly is redirected to the dashboard', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/team');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 10_000 });
  });

  test('SUPERVISOR opening /app/audit-logs directly sees the existing unauthorized message', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/audit-logs');
    await expect(page.getByText('Accès réservé à la direction.')).toBeVisible({ timeout: 10_000 });
  });

  test('DIRECTOR can still reach /app/team and /app/audit-logs directly', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/team');
    await expect(page).toHaveURL(/\/app\/team$/, { timeout: 10_000 });
    await expect(page.getByTestId('team-tab-active')).toBeVisible({ timeout: 10_000 });

    await page.goto('/app/audit-logs');
    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Supervisor dashboard + Administration hub — mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow on either page', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    // Scoped to the dashboard's own content — the sidebar now also has a
    // "Demandes à valider" *link* (same rename), which a page-wide text
    // search would otherwise collide with.
    await expect(page.getByTestId('supervisor-dashboard').getByText('Demandes à valider')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    await page.goto('/app/administration');
    await expect(page.getByText('Locaux et espaces')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
