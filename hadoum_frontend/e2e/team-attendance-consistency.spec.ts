import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// Regression coverage for the "Mon équipe" > "Présences" statistics
// inconsistency: the header subtitle, the (since-removed) top nudge banner,
// the "Présences" tab badge, and the bulk-confirm button used to each read
// from a different dataset, so they could disagree with each other and with
// the tab's own stat cards. All of them now derive from the same
// `listDailyPresence` fetch via `summarizeDailyPresence` — see TeamPage's
// `todayPresence` state. These tests assert that single-source invariant
// directly, rather than any specific absolute count (the shared dev DB
// accumulates staff/confirmations across runs).
//
// Attendance page fix (this PR): the page used to show the same
// "N présences non confirmées" figure twice (top banner + the "Présences"
// tab's own summary block above the member list/bulk button) and that
// figure incorrectly counted staff currently on Congé/Absence/Maladie —
// people who were never actually pending a decision. The top banner is now
// gone entirely (kept only the lower block), and "Non confirmées" —
// everywhere it appears: the stat card, the tab badge, the lower banner,
// the bulk button, and the filtered list — now excludes staff on leave.
// They're not silently dropped from the page, though: a dedicated
// "Indisponibles" stat card accounts for them, keeping
// Total équipe = Présents + Absents + Non confirmées + Indisponibles true.

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

async function apiCreateLeave(request: APIRequestContext, token: string, staffId: string, type: 'conge' | 'absence', dateDebut: string, dateFin?: string) {
  await request.post(`${API_BASE}/staff/${staffId}/attendance`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type, dateDebut, ...(dateFin ? { dateFin } : {}) },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysFromToday(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function readKpi(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).locator('p').first().innerText();
  return parseInt(text.trim(), 10);
}

// The stat cards render synchronously with a "0" placeholder before
// `listDailyPresence` resolves (`presence ? summarizeDailyPresence(presence)
// : { present: 0, absent: 0, nonConfirmed: 0 }`), so `getByTestId(...
// ).toBeVisible()` on a card is not enough to guarantee its number is the
// real one — the card is visible from the first render. Waiting for a
// presence row (gated by the same `loading` flag as the cards' data) is the
// actual "fetch has landed" signal; every KPI read below happens after this.
async function waitForPresenceLoaded(page: Page) {
  await expect(page.getByTestId(/presence-row-/).first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Mon équipe — attendance statistics single source of truth', () => {
  test('Total équipe = Présents + Absents + Non confirmées + Indisponibles', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateStaff(request, token, unique('InvariantTotal'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);

    const total = await readKpi(page, 'presence-filter-all');
    const present = await readKpi(page, 'presence-filter-present');
    const absent = await readKpi(page, 'presence-filter-absent');
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');
    const onLeave = await readKpi(page, 'on-leave-kpi');

    expect(present + absent + nonConfirmed + onLeave).toBe(total);
  });

  test('the header subtitle present count matches the Présences tab Present card', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('SubtitleMatch');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();

    const total = await readKpi(page, 'presence-filter-all');

    await page.getByTestId('team-tab-active').click();
    const subtitle = page.getByTestId('team-header-subtitle');
    await expect(subtitle).toContainText(`${total} membres actifs`);

    // Present count specifically is compared against ground truth fetched
    // at essentially the same instant, and the *pair* is retried together
    // — this is the shared dev DB, so someone else's staff could legitimately
    // confirm another presence in this same window; a fixed snapshot taken
    // before the tab switch would then never match again. Comparing two
    // near-simultaneous reads (instead of one early one vs. one late one)
    // stays correct regardless of that outside activity.
    await expect.poll(async () => {
      const live = await request.get(`${API_BASE}/staff/presence?date=${todayIso()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const livePresent = live.entries.filter((e: { status: string }) => e.status === 'PRESENT').length;
      const text = await subtitle.innerText();
      return text.includes(`${livePresent} présents aujourd'hui`);
    }, { timeout: 10_000, intervals: [500] }).toBe(true);
  });

  test('the Présences tab badge matches the Non confirmées card', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateStaff(request, token, unique('BadgeMatch'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');

    await expect(page.getByTestId('team-tab-attendance')).toContainText(String(nonConfirmed));
  });

  test('the top duplicate banner is gone; only the lower "Présences" tab summary block shows the count', async ({ page, request }) => {
    const token = await directorToken(request);
    // Guarantees nonConfirmedCount >= 1 so the lower banner is guaranteed to
    // render, and — before this fix — the top one would have too.
    await apiCreateStaff(request, token, unique('BannerMatch'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');
    expect(nonConfirmed).toBeGreaterThan(0);

    // The lower, in-tab block (above the member list/bulk button) is kept
    // and shows the correct number.
    await expect(page.getByTestId('unconfirmed-alert')).toContainText(String(nonConfirmed));
    // The old top-of-page banner no longer exists anywhere on this page,
    // on this tab or any other — not just hidden by a 0-count guard.
    await expect(page.getByTestId('team-unconfirmed-alert')).toHaveCount(0);

    await page.getByTestId('team-tab-active').click();
    await expect(page.getByTestId('team-unconfirmed-alert')).toHaveCount(0);
    await page.getByTestId('team-tab-attendance').click();
  });

  test('the bulk-confirm button count always equals the Non confirmées card — no more silent gap', async ({ page, request }) => {
    const token = await directorToken(request);
    const staffOnLeave = await apiCreateStaff(request, token, unique('BulkOnLeave'));
    await apiCreateLeave(request, token, staffOnLeave.id, 'conge', todayIso());
    await apiCreateStaff(request, token, unique('BulkEligible'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');

    const bulkButton = page.getByTestId('bulk-confirm-present');
    await expect(bulkButton).toBeVisible();
    const bulkText = await bulkButton.innerText();
    const bulkCount = parseInt(bulkText.match(/\d+/)?.[0] ?? '-1', 10);

    // Non confirmées already excludes staff on leave (same as the bulk
    // button's own eligible set), so these must always be equal now — not
    // "equal or explained by a parenthetical", genuinely equal.
    expect(bulkCount).toBe(nonConfirmed);
    expect(bulkCount).toBeGreaterThan(0);

    // The staff member on leave is accounted for separately.
    const onLeave = await readKpi(page, 'on-leave-kpi');
    expect(onLeave).toBeGreaterThan(0);
  });

  test('confirming one person updates every count immediately, with no page reload', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('LiveRefresh');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const presentBefore = await readKpi(page, 'presence-filter-present');
    const nonConfirmedBefore = await readKpi(page, 'non-confirmed-kpi');

    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();

    await expect(page.getByTestId('presence-filter-present').locator('p').first())
      .toHaveText(String(presentBefore + 1));
    await expect(page.getByTestId('non-confirmed-kpi').locator('p').first())
      .toHaveText(String(nonConfirmedBefore - 1));
    await expect(page.getByTestId('team-tab-attendance')).toContainText(String(nonConfirmedBefore - 1));

    // Header subtitle lives in a different part of the component tree
    // (rendered only on other tabs) and used to be powered by a completely
    // separate, stale fetch — confirm it picked up the same change too.
    await page.getByTestId('team-tab-active').click();
    await expect(page.getByTestId('team-header-subtitle')).toContainText(`${presentBefore + 1} présents aujourd'hui`);
  });

  test('confirming one person absent updates every count immediately', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('LiveRefreshAbsent');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const absentBefore = await readKpi(page, 'presence-filter-absent');
    const nonConfirmedBefore = await readKpi(page, 'non-confirmed-kpi');

    await row.getByRole('button', { name: 'Absent' }).click();
    await expect(row.getByText('Absent', { exact: true })).toBeVisible();

    await expect(page.getByTestId('presence-filter-absent').locator('p').first())
      .toHaveText(String(absentBefore + 1));
    await expect(page.getByTestId('non-confirmed-kpi').locator('p').first())
      .toHaveText(String(nonConfirmedBefore - 1));
  });

  test('bulk confirmation updates every count immediately, matching the number of confirmed rows', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateStaff(request, token, unique('BulkRefreshA'));
    await apiCreateStaff(request, token, unique('BulkRefreshB'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);

    const presentBefore = await readKpi(page, 'presence-filter-present');
    const nonConfirmedBefore = await readKpi(page, 'non-confirmed-kpi');
    const bulkButton = page.getByTestId('bulk-confirm-present');
    await expect(bulkButton).toBeVisible();
    const bulkCount = parseInt((await bulkButton.innerText()).match(/\d+/)?.[0] ?? '0', 10);

    await bulkButton.click();
    await expect(page.getByTestId('non-confirmed-kpi').locator('p').first())
      .toHaveText(String(nonConfirmedBefore - bulkCount), { timeout: 10_000 });
    await expect(page.getByTestId('presence-filter-present').locator('p').first())
      .toHaveText(String(presentBefore + bulkCount));

    // The bulk button disappears once the eligible count reaches zero.
    if (nonConfirmedBefore - bulkCount === 0) {
      await expect(page.getByTestId('bulk-confirm-present')).toHaveCount(0);
    }

    const total = await readKpi(page, 'presence-filter-all');
    const present = await readKpi(page, 'presence-filter-present');
    const absent = await readKpi(page, 'presence-filter-absent');
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');
    const onLeave = await readKpi(page, 'on-leave-kpi');
    expect(present + absent + nonConfirmed + onLeave).toBe(total);
  });

  test('bulk confirmation never touches a staff member on leave', async ({ page, request }) => {
    const token = await directorToken(request);
    const onLeaveName = unique('BulkExcludesLeave');
    const staffOnLeave = await apiCreateStaff(request, token, onLeaveName);
    await apiCreateLeave(request, token, staffOnLeave.id, 'absence', todayIso());
    await apiCreateStaff(request, token, unique('BulkExcludesEligible'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);

    const onLeaveBefore = await readKpi(page, 'on-leave-kpi');
    const bulkButton = page.getByTestId('bulk-confirm-present');
    await expect(bulkButton).toBeVisible();
    await bulkButton.click();
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible();

    // The Indisponibles count is untouched by the bulk action — the staff
    // member on leave is still there, still on leave, still not PRESENT.
    await expect(page.getByTestId('on-leave-kpi').locator('p').first())
      .toHaveText(String(onLeaveBefore), { timeout: 10_000 });

    await page.getByPlaceholder('Rechercher un membre…').fill(onLeaveName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: onLeaveName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Absence (RH)')).toBeVisible();
    await expect(row.getByText('Géré via Congé/Absence')).toBeVisible();
  });

  test('changing the selected date recomputes every stat card, and the invariant still holds', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DateRecompute');
    await apiCreateStaff(request, token, firstName);

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Présent' }).click();
    await expect(row.getByText('Présent', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });

    // The newly created staff member has no confirmation for yesterday, so
    // yesterday's row for them must be back to Non confirmée...
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const rowYesterday = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(rowYesterday).toBeVisible({ timeout: 10_000 });
    await expect(rowYesterday.getByText('Non confirmée')).toBeVisible();
    await page.getByPlaceholder('Rechercher un membre…').fill('');

    // ...and every stat card for yesterday must still satisfy the same
    // invariant as today's did, proving they were recomputed for the new
    // date rather than left over from today.
    const total = await readKpi(page, 'presence-filter-all');
    const present = await readKpi(page, 'presence-filter-present');
    const absent = await readKpi(page, 'presence-filter-absent');
    const nonConfirmed = await readKpi(page, 'non-confirmed-kpi');
    const onLeave = await readKpi(page, 'on-leave-kpi');
    expect(present + absent + nonConfirmed + onLeave).toBe(total);
  });

  test('changing the date recomputes leave eligibility: excluded on the day the leave covers, included the day before', async ({ page, request }) => {
    const token = await directorToken(request);
    const firstName = unique('DateEligibility');
    const staff = await apiCreateStaff(request, token, firstName);
    // Leave covers today and tomorrow only — yesterday is unaffected.
    await apiCreateLeave(request, token, staff.id, 'conge', todayIso(), isoDaysFromToday(1));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    await expect(page.getByTestId(/presence-row-/).filter({ hasText: firstName })).toBeVisible({ timeout: 10_000 });

    // Today: on leave, flagged, excluded from Non confirmées.
    const rowToday = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(rowToday.getByText('En congé')).toBeVisible();

    // Yesterday: leave doesn't cover this date — genuinely non-confirmed.
    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await page.getByPlaceholder('Rechercher un membre…').fill(firstName);
    const rowYesterday = page.getByTestId(/presence-row-/).filter({ hasText: firstName });
    await expect(rowYesterday).toBeVisible({ timeout: 10_000 });
    await expect(rowYesterday.getByText('Non confirmée')).toBeVisible();
    await expect(rowYesterday.getByRole('button', { name: 'Présent' })).toBeVisible();
  });

  test('switching the status filter narrows the visible list without changing the stat cards', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateStaff(request, token, unique('FilterNoop'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);

    const totalBefore = await readKpi(page, 'presence-filter-all');
    const presentBefore = await readKpi(page, 'presence-filter-present');
    const absentBefore = await readKpi(page, 'presence-filter-absent');
    const nonConfirmedBefore = await readKpi(page, 'non-confirmed-kpi');
    const onLeaveBefore = await readKpi(page, 'on-leave-kpi');

    await page.getByTestId('presence-filter-present').click();
    await expect(page.getByTestId('presence-filter-present')).toHaveCSS('border-color', 'rgb(6, 95, 70)');

    expect(await readKpi(page, 'presence-filter-all')).toBe(totalBefore);
    expect(await readKpi(page, 'presence-filter-present')).toBe(presentBefore);
    expect(await readKpi(page, 'presence-filter-absent')).toBe(absentBefore);
    expect(await readKpi(page, 'non-confirmed-kpi')).toBe(nonConfirmedBefore);
    expect(await readKpi(page, 'on-leave-kpi')).toBe(onLeaveBefore);
  });

  test('the "Indisponibles" filter shows only staff on leave/absence, distinct from "Non confirmées"', async ({ page, request }) => {
    const token = await directorToken(request);
    const onLeaveName = unique('FilterOnLeave');
    const staffOnLeave = await apiCreateStaff(request, token, onLeaveName);
    await apiCreateLeave(request, token, staffOnLeave.id, 'conge', todayIso());

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await waitForPresenceLoaded(page);

    await page.getByTestId('on-leave-kpi').click();
    await page.getByPlaceholder('Rechercher un membre…').fill(onLeaveName);
    const row = page.getByTestId(/presence-row-/).filter({ hasText: onLeaveName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('En congé')).toBeVisible();

    // Switching to "Non confirmées" must not show this person — they're
    // excluded from that bucket entirely, not just from its count.
    await page.getByPlaceholder('Rechercher un membre…').fill('');
    await page.getByTestId('on-leave-kpi').click(); // toggle off
    await page.getByTestId('non-confirmed-kpi').click();
    await page.getByPlaceholder('Rechercher un membre…').fill(onLeaveName);
    await expect(page.getByTestId(/presence-row-/).filter({ hasText: onLeaveName })).toHaveCount(0);
  });
});

test.describe('Mon équipe — attendance mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow and no leftover gap where the top banner used to be', async ({ page, request }) => {
    const token = await directorToken(request);
    // Guarantee at least one non-confirmed staff member so the lower banner
    // renders (the case most likely to reveal a layout regression).
    await apiCreateStaff(request, token, unique('MobileGap'));

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await expect(page.getByTestId('non-confirmed-kpi')).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // No orphaned top banner on this or any other tab.
    await expect(page.getByTestId('team-unconfirmed-alert')).toHaveCount(0);
    await page.getByTestId('team-tab-active').click();
    await expect(page.getByTestId('team-unconfirmed-alert')).toHaveCount(0);
    const overflowOnActiveTab = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflowOnActiveTab).toBe(false);
  });

  test('the 5-card stat grid (including Indisponibles) fits without overflow on mobile', async ({ page, request }) => {
    const token = await directorToken(request);
    const staffOnLeave = await apiCreateStaff(request, token, unique('MobileIndispo'));
    await apiCreateLeave(request, token, staffOnLeave.id, 'conge', todayIso());

    await loginAsDirector(page);
    await page.goto('/app/team?tab=attendance');
    await expect(page.getByTestId('on-leave-kpi')).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
