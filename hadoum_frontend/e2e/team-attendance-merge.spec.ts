import { test, expect, APIRequestContext } from '@playwright/test';
import {
  DIRECTOR_CREDENTIALS, loginAsDirector, loginAsSupervisor, loginAsEducator,
} from './helpers';

// Director Dashboard and Team navigation update: staff attendance stats on
// the Director Dashboard, removal of the "Demander des fonds"/"Exporter"
// header buttons, and the merge of the separate "Présences équipe" menu/page
// into "Mon équipe" (now a "Présences" tab there instead of its own route).
// See staff-attendance.spec.ts for the confirm/reset/badge/date behavior
// itself (moved, not duplicated, into TeamPage's PresenceTab) — this file
// covers the navigation/routing/dashboard-stat-card layer added on top.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

async function apiCreateStaff(request: APIRequestContext, token: string, firstName: string) {
  const res = await request.post(`${API_BASE}/staff`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { firstName, lastName: 'E2E', role: 'Éducateur' },
  });
  return res.json();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe('Director Dashboard — Présence de l\'équipe stat cards', () => {
  test('shows the three real attendance counts, matching the presence API', async ({ page, request }) => {
    const token = await directorToken(request);
    const dashboardData = await request.get(`${API_BASE}/staff/presence?date=${todayIso()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const presentCount = dashboardData.entries.filter((e: { status: string }) => e.status === 'PRESENT').length;
    const absentCount = dashboardData.entries.filter((e: { status: string }) => e.status === 'ABSENT').length;

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('team-presence-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-presence-present')).toContainText(String(presentCount));
    await expect(page.getByTestId('kpi-presence-absent')).toContainText(String(absentCount));
    await expect(page.getByTestId('kpi-presence-non-confirmed')).toContainText(String(dashboardData.nonConfirmedCount));
  });

  test('clicking Présents/Absents navigates to Mon équipe / Présences with the matching filter', async ({ page }) => {
    await loginAsDirector(page);

    await page.goto('/app/dashboard');
    await expect(page.getByTestId('kpi-presence-present')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('kpi-presence-present').click();
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance&status=PRESENT/);
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('presence-filter-present')).toHaveCSS('border-color', 'rgb(6, 95, 70)');

    await page.goto('/app/dashboard');
    await page.getByTestId('kpi-presence-absent').click();
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance&status=ABSENT/);
    await expect(page.getByTestId('presence-filter-absent')).toHaveCSS('border-color', 'rgb(185, 28, 28)');
  });

  // Dashboard attendance section improvement: "Non confirmées" no longer
  // navigates away directly — it opens the `NonConfirmedModal` listing the
  // exact people counted, and only *that* modal's own "Confirmer" button
  // navigates onward (one person at a time — see director-dashboard.spec.ts
  // for full coverage of the modal itself).
  test('clicking Non confirmées opens the modal instead of navigating away', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('kpi-presence-non-confirmed')).not.toContainText('—', { timeout: 10_000 });

    await page.getByTestId('kpi-presence-non-confirmed').click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByTestId('non-confirmed-modal')).toBeVisible();
  });

  test('the Non confirmées card is highlighted when its count is greater than zero', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateStaff(request, token, unique('NonConfirmedNudge'));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    const card = page.getByTestId('kpi-presence-non-confirmed');
    const valueEl = card.locator('p').first();
    // Wait past the "—" loading placeholder before reading the count.
    await expect(valueEl).not.toHaveText('—', { timeout: 10_000 });
    // The shared dev DB already accumulates non-confirmed staff across
    // runs, so just assert the count is a positive number rather than
    // checking for the literal digit "0" (which the count itself may
    // legitimately contain, e.g. "101").
    const count = parseInt((await valueEl.innerText()).trim(), 10);
    expect(count).toBeGreaterThan(0);
    await expect(card).toHaveCSS('border-color', 'rgb(217, 119, 6)');
  });
});

test.describe('Director Dashboard — removed header buttons', () => {
  test('"Demander des fonds" and "Exporter" are no longer on the dashboard', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('finance-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Demander des fonds' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exporter' })).toHaveCount(0);
  });
});

test.describe('Sidebar — "Présences équipe" removed, "Mon équipe" remains', () => {
  test('DIRECTOR no longer sees a separate "Présences équipe" entry', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('link', { name: 'Mon équipe' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Présences équipe' })).toHaveCount(0);
  });

  // "Mon équipe" was later removed from the SUPERVISOR sidebar entirely
  // (Supervisor experience simplification) — this now checks neither legacy
  // nor current entry is present; see supervisor.spec.ts for the full
  // Supervisor-sidebar and redirect coverage.
  test('SUPERVISOR sees neither "Mon équipe" nor "Présences équipe"', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('link', { name: "Vue d'ensemble" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Mon équipe' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Présences équipe' })).toHaveCount(0);
  });
});

test.describe('Mon équipe — Présences tab', () => {
  test('the tab is present and shows the attendance list', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('TabPresence');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team');
    await page.getByTestId('team-tab-attendance').click();
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    await expect(page.getByTestId(/presence-row-/).filter({ hasText: firstName })).toBeVisible({ timeout: 10_000 });
  });

  test('DIRECTOR can confirm attendance from the tab', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('TabConfirm');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();
  });

  // SUPERVISOR can no longer reach this tab at all (redirected to the
  // dashboard before the page renders) — see staff-attendance.spec.ts's
  // "SUPERVISOR opening the Présences deep-link is redirected" and
  // supervisor.spec.ts for that coverage; the read-only view this used to
  // check no longer exists as a reachable state.
});

test.describe('Legacy /app/attendance route', () => {
  test('DIRECTOR is redirected to Mon équipe / Présences', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/attendance');
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance/, { timeout: 10_000 });
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });
  });

  test('DIRECTOR keeps a status filter across the redirect', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/attendance?status=ABSENT');
    await expect(page).toHaveURL(/\/app\/team\?tab=attendance&status=ABSENT/, { timeout: 10_000 });
  });

  // Chained redirect: /app/attendance still forwards SUPERVISOR to
  // /app/team?tab=attendance as before, but "Mon équipe" is now
  // DIRECTOR-only (Supervisor experience simplification), so that second
  // hop immediately redirects again, landing on the dashboard.
  test('SUPERVISOR ends up on the dashboard (chained through the now-removed Mon équipe access)', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/attendance');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 10_000 });
  });

  test('EDUCATOR still sees the children-attendance page at this route, unaffected', async ({ page }) => {
    await loginAsEducator(page);
    await page.goto('/app/attendance');
    await expect(page).toHaveURL(/\/app\/attendance$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Présences des élèves' })).toBeVisible({ timeout: 10_000 });
  });
});
