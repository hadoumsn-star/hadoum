import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// PR 10: Staff attendance improvements — weekly schedule Samedi/Dimanche
// support and the daily presence confirmation workflow. Fixture staff are
// created directly through the Staff API for isolation (the shared dev
// database already has 30+ accumulated staff rows from earlier PR fixtures)
// — every assertion about the actual confirm/reset/badge/date behavior is
// driven through the real TeamPage UI.
//
// Team navigation update: daily presence confirmation moved from its own
// AttendancePage route into the "Présences" tab of "Mon équipe"
// (/app/team?tab=attendance) — these tests were updated to navigate there
// directly; see director-dashboard.spec.ts and team-presence.spec.ts for
// coverage of the /app/attendance legacy-route redirect and the Dashboard's
// attendance stat cards.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}
function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}

async function apiCreateStaff(request: APIRequestContext, token: string, firstName: string) {
  const res = await request.post(`${API_BASE}/staff`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { firstName, lastName: 'E2E', role: 'Éducateur' },
  });
  return res.json();
}

async function apiCreateLeave(request: APIRequestContext, token: string, staffId: string, type: 'conge' | 'absence', dateDebut: string) {
  await request.post(`${API_BASE}/staff/${staffId}/attendance`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type, dateDebut },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe('Staff attendance — weekly schedule Samedi/Dimanche (PR 10)', () => {
  test('preserves an existing Monday-Friday schedule when editing a member', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('Planning');
    const staff = await apiCreateStaff(request, token, firstName);
    await request.patch(`${API_BASE}/staff/${staff.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { scheduleJson: JSON.stringify({ Lundi: [{ debut: '08:00', fin: '12:00', label: 'Classe' }], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [] }) },
    });

    await loginAsDirector(page);
    await page.goto('/app/team');
    await page.getByPlaceholder('Rechercher…').fill(firstName);
    await expect(page.getByText('LUN')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('08:00–12:00 · Classe')).toBeVisible();
  });

  test('Samedi and Dimanche can be saved and displayed', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('Weekend');
    const staff = await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team');
    await page.getByPlaceholder('Rechercher…').fill(firstName);
    await page.getByTitle('Modifier').click();

    const modal = page.getByRole('heading', { name: 'Modifier la fiche' }).locator('../..');
    await expect(modal.getByText('Samedi', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText('Dimanche', { exact: true })).toBeVisible();

    // Add a Saturday slot and save.
    const samediRow = modal.locator('div').filter({ hasText: /^Samedi/ }).first();
    await samediRow.getByRole('button', { name: '+ Créneau' }).click();
    const timeInputs = samediRow.locator('input[type="time"]');
    await timeInputs.nth(0).fill('09:00');
    await timeInputs.nth(1).fill('12:00');
    await samediRow.locator('input[type="text"]').fill('Permanence');

    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const res = await request.get(`${API_BASE}/staff/${staff.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const updated = await res.json();
    const saved = JSON.parse(updated.scheduleJson);
    expect(saved.Samedi).toHaveLength(1);
    expect(saved.Samedi[0].label).toBe('Permanence');
    expect(saved.Dimanche).toEqual([]);
  });
});

test.describe('Staff attendance — daily presence confirmation (PR 10)', () => {
  test('defaults to Non confirmée', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DefaultStatus');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Non confirmée')).toBeVisible();
  });

  test('DIRECTOR confirms PRESENT', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('ConfirmPresent');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Réinitialiser' })).toBeVisible();
  });

  test('DIRECTOR confirms ABSENT', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('ConfirmAbsent');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Absent' }).click();
    await expect(row.getByText('Absent', { exact: true })).toBeVisible();
  });

  test('changing the date shows a different day independently', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DateChange');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible();

    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const rowYesterday = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(rowYesterday).toBeVisible({ timeout: 10_000 });
    await expect(rowYesterday.getByText('Non confirmée')).toBeVisible();
  });

  test('the unconfirmed count is correct', async ({ page, request }) => {
    const token = await directorToken(request);
    const nameA = unique('CountA');
    const nameB = unique('CountB');
    const staffA = await apiCreateStaff(request, token, nameA);
    await apiCreateStaff(request, token, nameB);

    const before = await request.get(`${API_BASE}/staff/presence?date=${todayIso()}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    const countBefore = before.nonConfirmedCount;

    await request.post(`${API_BASE}/staff/${staffA.id}/presence`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { date: todayIso(), status: 'PRESENT' },
    });

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await expect(page.getByTestId('non-confirmed-kpi')).toContainText(String(countBefore - 1), { timeout: 10_000 });
  });

  test('resetting a confirmation returns it to Non confirmée', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('ResetMe');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Absent' }).click();
    await expect(row.getByRole('button', { name: 'Réinitialiser' })).toBeVisible();

    await row.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(row.getByText('Non confirmée')).toBeVisible();
  });

  test('a staff member with an active Congé is shown distinctly and cannot be confirmed here', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('OnLeave');
    const staff = await apiCreateStaff(request, token, firstName);
    await apiCreateLeave(request, token, staff.id, 'conge', todayIso());

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('En congé')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Présent' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Absent' })).toHaveCount(0);
  });

  test('existing Congé/Retard/Absence creation on TeamPage still works', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('LeaveStillWorks');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team');
    await page.getByPlaceholder('Rechercher…').fill(firstName);
    await page.getByTitle('Absences / Congés').click();

    const modal = page.getByRole('heading', { name: 'Absences / Congés' }).locator('../../..');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByText('Congé', { exact: true }).click();
    // The native date input is deliberately visually hidden (only its 📅
    // trigger button is shown) — force the fill past the visibility check.
    await page.locator('#att-debut').fill('2026-08-10', { force: true });
    await modal.getByRole('button', { name: 'Enregistrer' }).click();

    // A new "Congé" entry appears in the record history below the form.
    await expect(modal.getByText('Congé', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  // "Mon équipe" (and therefore its Présences tab) is now DIRECTOR-only
  // (Supervisor experience simplification) — a SUPERVISOR opening this
  // exact deep-link is redirected to the dashboard rather than seeing a
  // read-only view; see supervisor.spec.ts for the plain-URL case.
  test('SUPERVISOR opening the Présences deep-link is redirected to the dashboard', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('SupervisorRedirect');
    await apiCreateStaff(request, token, firstName);

    await loginAsSupervisor(page);
    await page.goto('/app/team?tab=attendance');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 10_000 });
  });
});

test.describe('Staff attendance — mobile layout (PR 10)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the Présences tab of Mon équipe has no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
