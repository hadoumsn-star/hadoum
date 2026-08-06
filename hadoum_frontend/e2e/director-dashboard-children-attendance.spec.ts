import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector } from './helpers';

// Director Dashboard — "Présence des enfants" section.
// Real child attendance stats (Présents/Absents), sourced from the same
// GET /children ChildrenPage itself uses (no new backend endpoint), tallied
// with the exact same rules as ChildrenPage's own "Présent aujourd'hui" stat
// card (../src/app/utils/childAttendance.ts) — so these two counts, and the
// underlying eligibility rules, can never diverge. There is deliberately no
// "Non confirmée" card and no confirmation workflow for children — every
// effectively-active child is counted as exactly PRESENT or ABSENT.
// See team-attendance-merge.spec.ts for the equivalent staff-presence
// coverage this file is modeled on (kept separate: different model/API).

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function apiCreateChild(request: APIRequestContext, token: string, firstName: string) {
  const res = await request.post(`${API_BASE}/children`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      firstName,
      lastName: 'E2E',
      dateOfBirth: '2015-01-01',
      placeOfBirth: 'Dakar',
      gender: 'MASCULIN',
      entryDate: todayIso(),
      status: 'ORPHELIN_COMPLET',
    },
  });
  return res.json();
}

async function apiExitChild(
  request: APIRequestContext, token: string, id: string,
  data: { exitType: string; exitDate: string; exitReason?: string; dateRetour?: string },
) {
  await request.post(`${API_BASE}/children/${id}/exit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { exitReason: 'Test E2E', ...data },
  });
}

// ─── Reimplementation of ../src/app/utils/childAttendance.ts, applied to
// the raw ApiChildSummary JSON, kept intentionally independent of the
// frontend source so this test can catch a real divergence rather than
// import the very code it's meant to verify.
interface RawChild { isActive: boolean; exitType?: string | null; exitDate?: string | null; exitReturnDate?: string | null }

function daysFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
function sortieState(c: RawChild): 'none' | 'pending' | 'active' | 'returned' {
  if (c.exitType !== 'temporaire' || !c.exitDate) return 'none';
  const daysUntilDep = daysFromToday(c.exitDate);
  if (daysUntilDep > 0) return 'pending';
  if (c.exitReturnDate && daysFromToday(c.exitReturnDate) <= 0) return 'returned';
  return 'active';
}
function isEligible(c: RawChild): boolean {
  if (c.isActive !== false) return true;
  const state = sortieState(c);
  return state === 'active' || state === 'returned' || state === 'pending';
}
function effectiveAttendance(c: RawChild): 'present' | 'absent' {
  const state = sortieState(c);
  return (state === 'active' || state === 'returned') ? 'absent' : 'present';
}

// Same reasoning as team-attendance-merge.spec.ts's waitForPresenceKpiLoaded
// — the card renders a "—" placeholder before childrenApi.list() resolves.
async function waitForChildPresenceKpiLoaded(page: Page) {
  await expect(page.getByTestId('kpi-child-presence-present')).not.toContainText('—', { timeout: 10_000 });
}

test.describe('Director Dashboard — Présence des enfants', () => {
  test('section and both stat cards are visible with a clear icon each', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    await expect(page.getByTestId('section-title-presence-enfants')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('section-title-presence-enfants')).toHaveText('PRÉSENCE DES ENFANTS');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible();
    await expect(page.getByTestId('kpi-child-presence-present')).toBeVisible();
    await expect(page.getByTestId('kpi-child-presence-absent')).toBeVisible();
    await expect(page.getByTestId('kpi-child-presence-present').locator('svg')).toBeVisible();
    await expect(page.getByTestId('kpi-child-presence-absent').locator('svg')).toBeVisible();
  });

  test('Présents/Absents counts match the real /children API, using the same eligibility rules as Dossiers enfants', async ({ page, request }) => {
    const token = await directorToken(request);
    const children: RawChild[] = await request.get(`${API_BASE}/children`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const eligible = children.filter(isEligible);
    const expectedPresent = eligible.filter(c => effectiveAttendance(c) === 'present').length;
    const expectedAbsent = eligible.length - expectedPresent;

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    await expect(page.getByTestId('kpi-child-presence-present')).toContainText(String(expectedPresent));
    await expect(page.getByTestId('kpi-child-presence-absent')).toContainText(String(expectedAbsent));
  });

  test('Présents count matches the "Présents aujourd\'hui" stat on Dossiers enfants exactly', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    const dashboardText = await page.getByTestId('kpi-child-presence-present').locator('p').first().innerText();
    const dashboardPresent = parseInt(dashboardText.trim(), 10);

    await page.goto('/app/children');
    const statText = await page.getByTestId('children-present-stat').innerText();
    // "N sur M" — N is presentCount, the same value the dashboard card shows.
    const pagePresent = parseInt(statText.trim().split(/\s+/)[0], 10);
    expect(pagePresent).toBe(dashboardPresent);
  });

  test('no "Non confirmée" child attendance card exists — children have no confirmation workflow', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('kpi-child-presence-non-confirmed')).toHaveCount(0);
    await expect(page.getByTestId('child-presence-kpis').getByTestId(/^kpi-child-presence-/)).toHaveCount(2);
    await expect(page.getByTestId('child-presence-kpis').getByText('Non confirmée')).toHaveCount(0);
    await expect(page.getByTestId('child-presence-kpis').getByText('Non confirmées')).toHaveCount(0);
  });

  test('clicking Présents navigates to Dossiers enfants filtered on Présents', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);

    await page.getByTestId('kpi-child-presence-present').click();
    await expect(page).toHaveURL(/\/app\/children\?attendance=present/);
    await expect(page.getByRole('heading', { name: 'Dossiers enfants' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('children-attendance-filter-present')).toHaveCSS('background-color', 'rgb(62, 90, 120)');
  });

  test('clicking Absents navigates to Dossiers enfants filtered on Absents', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);

    await page.getByTestId('kpi-child-presence-absent').click();
    await expect(page).toHaveURL(/\/app\/children\?attendance=absent/);
    await expect(page.getByRole('heading', { name: 'Dossiers enfants' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('children-attendance-filter-absent')).toHaveCSS('background-color', 'rgb(62, 90, 120)');
  });

  test('a newly created child (never exited) is counted as Présent', async ({ page, request }) => {
    const token = await directorToken(request);
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    const before = parseInt((await page.getByTestId('kpi-child-presence-present').locator('p').first().innerText()).trim(), 10);

    await apiCreateChild(request, token, unique('DashChildPresent'));

    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    await expect(page.getByTestId('kpi-child-presence-present').locator('p').first())
      .toHaveText(String(before + 1), { timeout: 10_000 });
  });

  test('a child on an active (departed, not yet returned) temporary sortie is counted as Absent, not excluded', async ({ page, request }) => {
    const token = await directorToken(request);
    const name = unique('DashChildSortie');
    const child = await apiCreateChild(request, token, name);

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    const presentBefore = parseInt((await page.getByTestId('kpi-child-presence-present').locator('p').first().innerText()).trim(), 10);
    const absentBefore = parseInt((await page.getByTestId('kpi-child-presence-absent').locator('p').first().innerText()).trim(), 10);

    // Departed today, no return date yet → sortie state 'active' → Absent.
    // The child was just created (counted in presentBefore as Présent), so
    // it now moves buckets: Présent -1, Absent +1 — still counted overall,
    // never dropped from the eligible pool.
    await apiExitChild(request, token, child.id, { exitType: 'temporaire', exitDate: todayIso() });

    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    await expect(page.getByTestId('kpi-child-presence-absent').locator('p').first())
      .toHaveText(String(absentBefore + 1), { timeout: 10_000 });
    await expect(page.getByTestId('kpi-child-presence-present').locator('p').first())
      .toHaveText(String(presentBefore - 1), { timeout: 10_000 });

    // Same conclusion on Dossiers enfants for the same date — no divergence.
    await page.goto('/app/children');
    await page.getByPlaceholder('Rechercher un enfant…').fill(name);
    await expect(page.getByText('Absent', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('a child who definitively left the institution is excluded from both Présents and Absents', async ({ page, request }) => {
    const token = await directorToken(request);
    const child = await apiCreateChild(request, token, unique('DashChildExited'));

    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    const presentAfterCreate = parseInt((await page.getByTestId('kpi-child-presence-present').locator('p').first().innerText()).trim(), 10);
    const absentBefore = parseInt((await page.getByTestId('kpi-child-presence-absent').locator('p').first().innerText()).trim(), 10);

    await apiExitChild(request, token, child.id, { exitType: 'définitive', exitDate: todayIso() });

    await page.goto('/app/dashboard');
    await waitForChildPresenceKpiLoaded(page);
    // Back down by one Présent, and Absent unaffected — the child is
    // dropped entirely, not shifted into the other bucket.
    await expect(page.getByTestId('kpi-child-presence-present').locator('p').first())
      .toHaveText(String(presentAfterCreate - 1), { timeout: 10_000 });
    await expect(page.getByTestId('kpi-child-presence-absent').locator('p').first())
      .toHaveText(String(absentBefore), { timeout: 10_000 });
  });
});

test.describe('Director Dashboard — Présence des enfants block order', () => {
  test('sits between Présence de l\'équipe and Activité récente', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });

    const teamBox = await page.getByTestId('team-presence-kpis').boundingBox();
    const childBox = await page.getByTestId('child-presence-kpis').boundingBox();
    const activityBox = await page.getByTestId('recent-activity').boundingBox();
    expect(teamBox).not.toBeNull();
    expect(childBox).not.toBeNull();
    expect(activityBox).not.toBeNull();
    expect(teamBox!.y).toBeLessThan(childBox!.y);
    expect(childBox!.y).toBeLessThan(activityBox!.y);
  });
});

test.describe('Director Dashboard — section title style', () => {
  const TITLE_TESTIDS = [
    'section-title-actions-rapides',
    'section-title-demandes-a-traiter',
    'section-title-finances',
    'section-title-presence-equipe',
    'section-title-presence-enfants',
    'section-title-activite-recente',
  ];

  test('all six main section titles share one consistent, bold style, larger than a card label', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });

    const cardLabelSize = await page.getByTestId('kpi-presence-present').getByText('Présents').evaluate(
      el => parseFloat(getComputedStyle(el).fontSize),
    );

    for (const testId of TITLE_TESTIDS) {
      const title = page.getByTestId(testId);
      await expect(title).toBeVisible();
      const { fontSize, fontWeight } = await title.evaluate(el => {
        const s = getComputedStyle(el);
        return { fontSize: parseFloat(s.fontSize), fontWeight: parseInt(s.fontWeight, 10) };
      });
      expect(fontSize).toBeGreaterThan(cardLabelSize);
      expect(fontWeight).toBeGreaterThanOrEqual(700);
    }
  });

  test('titles are not oversized on mobile, and stay bold and consistent', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });

    for (const testId of TITLE_TESTIDS) {
      const { fontSize, fontWeight } = await page.getByTestId(testId).evaluate(el => {
        const s = getComputedStyle(el);
        return { fontSize: parseFloat(s.fontSize), fontWeight: parseInt(s.fontWeight, 10) };
      });
      // Mobile size stays modest (not the desktop-bumped size) but still
      // clearly bold.
      expect(fontSize).toBeLessThanOrEqual(16);
      expect(fontWeight).toBeGreaterThanOrEqual(700);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe('Director Dashboard — Présence des enfants mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders with no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');
    await expect(page.getByTestId('child-presence-kpis')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-child-presence-present')).toBeVisible();
    await expect(page.getByTestId('kpi-child-presence-absent')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
