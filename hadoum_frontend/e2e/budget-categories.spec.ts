import { test, expect, APIRequestContext } from '@playwright/test';
import {
  DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor,
} from './helpers';

// PR 6: default monthly budget categories, seeded idempotently by
// FinancesPage itself (POST /finances/budget-lines/ensure-defaults, called
// once on every page load — see hadoum_api's own budget-categories.e2e-spec.ts
// for the backend-level idempotency/no-overwrite guarantees). This suite
// only verifies the UI: the six brand-new categories this PR introduced
// (Vêtements, Transport, Études, Sport, Loisirs, Bureau et factures) are
// deterministic test subjects — nothing before this PR could have touched
// them.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}

function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}

function supervisorToken(request: APIRequestContext) {
  return apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
}

function categoryRow(page: import('@playwright/test').Page, category: string) {
  return page.getByTestId(`budget-row-${category}`);
}

test.describe('Budget categories and consumption UI (PR 6)', () => {
  test('default categories are seeded on page load, including a zero-budget one (Salaires) handled without NaN/crash', async ({ page, request }) => {
    // Budget editing (including the ensure-defaults seed call) is
    // SUPERVISOR-only now — FinancesPage only fires it for a SUPERVISOR
    // page load (see FinancesPage.tsx), so seed explicitly as SUPERVISOR
    // here before reading the result as DIRECTOR, proving DIRECTOR's read
    // access to the seeded categories is unaffected.
    const token = await supervisorToken(request);
    await request.post(`${API_BASE}/finances/budget-lines/ensure-defaults`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');

    const transport = categoryRow(page, 'TRANSPORT');
    await expect(transport).toBeVisible({ timeout: 10_000 });
    await expect(transport.getByText('Budget : 18 000 FCFA')).toBeVisible();

    await expect(categoryRow(page, 'VETEMENTS').getByText('Budget : 20 000 FCFA')).toBeVisible();
    await expect(categoryRow(page, 'ETUDES').getByText('Budget : 10 000 FCFA')).toBeVisible();
    await expect(categoryRow(page, 'SPORT').getByText('Budget : 30 000 FCFA')).toBeVisible();
    await expect(categoryRow(page, 'LOISIRS').getByText('Budget : 30 000 FCFA')).toBeVisible();
    await expect(categoryRow(page, 'BUREAU_FACTURES').getByText('Budget : 20 000 FCFA')).toBeVisible();

    // Salaires defaults to 0 — the percentage must render as "—", never
    // "NaN%"/"Infinity%", and available must show a real (zero) amount.
    const salaires = categoryRow(page, 'SALAIRES');
    await expect(salaires).toBeVisible();
    await expect(salaires.getByText('— engagé')).toBeVisible();
    await expect(salaires.getByText('NaN')).toHaveCount(0);
    await expect(salaires.getByText('Infinity')).toHaveCount(0);
    await expect(salaires.getByText('Budget : 0 FCFA')).toBeVisible();
    await expect(salaires.getByText('Disponible : 0 FCFA')).toBeVisible();
  });

  test('reloading the page twice creates no duplicate category rows', async ({ page }) => {
    // SUPERVISOR — only SUPERVISOR's page load fires the ensure-defaults
    // seed call now, so this is the role that can actually exercise the
    // backend's idempotency guarantee from a real page reload.
    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    await expect(categoryRow(page, 'SPORT')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(categoryRow(page, 'SPORT')).toBeVisible({ timeout: 10_000 });

    // Exactly one "Sport" budget row, not two — ensure-defaults is
    // idempotent (createMany + skipDuplicates on the backend).
    await expect(categoryRow(page, 'SPORT')).toHaveCount(1);
  });

  test('a custom amount already set for a default category is displayed as-is, not reset to the default', async ({ page, request }) => {
    // Budget editing is SUPERVISOR-only — directorToken would 403 here.
    const token = await supervisorToken(request);
    const now = new Date();
    // ENTRETIEN, not one of the 6 new default categories — deliberately, so
    // this never collides with the "seeded on page load" test's assertions
    // about the pristine defaults on a repeated run of this suite against
    // the same shared dev database.
    await request.put(`${API_BASE}/finances/budget-lines`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { category: 'ENTRETIEN', month: now.getMonth() + 1, year: now.getFullYear(), budgetXof: 77_321 },
    });

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const entretien = categoryRow(page, 'ENTRETIEN');
    await expect(entretien).toBeVisible({ timeout: 10_000 });
    // The page's own auto-seed call ran too — ENTRETIEN isn't one of the 9
    // defaults, so if ensure-defaults touched it at all, this custom amount
    // would be gone.
    await expect(entretien.getByText('Budget : 77 321 FCFA')).toBeVisible();
  });

  test('reserved/consumed/available reflect a real approved expense in a new category', async ({ page, browser, request }) => {
    const dToken = await directorToken(request);
    const now = new Date();

    // Read the current state first and assert on the *delta* this test's
    // own expense produces — SPORT is a shared category across repeated
    // runs of this suite against the same dev database, so a hardcoded
    // absolute expectation would only pass once.
    const before = await request.get(
      `${API_BASE}/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      { headers: { Authorization: `Bearer ${dToken}` } },
    ).then(r => r.json());
    const sportBefore = before.byCategory.find((c: any) => c.category === 'SPORT');
    const reservedBefore = sportBefore?.reservedXof ?? 0;
    const availableBefore = sportBefore?.availableXof ?? 30_000;

    const label = `Budget UI E2E ${Date.now()}`;
    const created = await request.post(`${API_BASE}/finances/transactions`, {
      headers: { Authorization: `Bearer ${dToken}` },
      data: {
        type: 'DEPENSE', category: 'SPORT', label, amountXof: 12_000,
        date: now.toISOString().slice(0, 10),
      },
    }).then(r => r.json());
    const submitRes = await request.post(`${API_BASE}/finances/transactions/${created.id}/submit`, {
      headers: { Authorization: `Bearer ${dToken}` }, data: {},
    });
    expect(submitRes.ok()).toBeTruthy();

    const supervisorContext = await browser.newContext();
    const sToken = await supervisorToken(request);
    const approveRes = await request.post(`${API_BASE}/finances/transactions/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${sToken}` }, data: {},
    });
    // Surface an INSUFFICIENT_BUDGET (or any other) failure here, at its
    // source, instead of as a confusing downstream reserved/available
    // mismatch several assertions later.
    expect(approveRes.ok()).toBeTruthy();
    await supervisorContext.close();

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const sport = categoryRow(page, 'SPORT');
    await expect(sport).toBeVisible({ timeout: 10_000 });
    const expectedReserved = (reservedBefore + 12_000).toLocaleString('fr-FR');
    const expectedAvailable = (availableBefore - 12_000).toLocaleString('fr-FR');
    await expect(sport.getByText(`Réservé : ${expectedReserved}`, { exact: false })).toBeVisible();
    await expect(sport.getByText(`Disponible : ${expectedAvailable}`, { exact: false })).toBeVisible();

    // Release this test's own reservation so repeated runs never accumulate
    // (nothing else in the app ever reverses an approved expense) — without
    // this, SPORT's headroom shrinks by 12 000 every run and eventually
    // makes the *next* run's own approve() fail with INSUFFICIENT_BUDGET.
    const cancelRes = await request.post(`${API_BASE}/finances/transactions/${created.id}/cancel`, {
      headers: { Authorization: `Bearer ${dToken}` }, data: {},
    });
    expect(cancelRes.ok()).toBeTruthy();
  });

  test('SUPERVISOR sees the same budget summary read-only', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    await expect(categoryRow(page, 'TRANSPORT').getByText('Budget : 18 000 FCFA')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Budget categories — mobile layout (PR 6)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Budget prévisionnel section has no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByText('Budget prévisionnel')).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
