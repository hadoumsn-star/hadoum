import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, loginAsDirector, loginAsSupervisor } from './helpers';

// Finance module — budget editing permissions. Only SUPERVISOR may edit
// budgets (create/update budget lines, seed defaults, delete lines);
// DIRECTOR keeps full read access (dashboard, budget overview/categories/
// statistics, charts, expenses, budget history) but never sees an editing
// control. See finances.controller.ts (backend @Roles('SUPERVISOR')
// overrides on the three budget-lines mutation routes) and
// FinancesPage.tsx's `isSupervisor` gate for the implementation this file
// verifies. Backend 403 coverage itself lives in
// hadoum_api/test/budget-categories.e2e-spec.ts's "Budget editing
// authorization" describe block — this file is UI-only.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(): number {
  return 10_000 + (Date.now() % 80_000);
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  return (await res.json()).token as string;
}
const supervisorToken = (request: APIRequestContext) => apiLogin(request, SUPERVISOR_CREDENTIALS.email, SUPERVISOR_CREDENTIALS.password);
const directorToken = (request: APIRequestContext) => apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);

test.describe('Finance — budget editing controls (SUPERVISOR can edit, DIRECTOR read-only)', () => {
  test('SUPERVISOR sees "Éditer le budget" and can save a change end-to-end', async ({ page, request }) => {
    // TRANSPORT — one of the 9 categories the editor modal actually shows
    // (BudgetEditorModal maps over EXPENSE_CATEGORIES, not every category —
    // e.g. EQUIPEMENT/ENTRETIEN/PEDAGOGIE aren't editable here at all).
    // budget-categories.spec.ts asserts TRANSPORT's *default* amount
    // (18 000 FCFA) elsewhere in this same shared dev database, so this
    // test restores the original value afterward — same cleanup convention
    // as that file's own "release this test's own reservation" step.
    const token = await supervisorToken(request);
    const now = new Date();
    const before = await request.get(
      `${API_BASE}/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    const originalAmount: number = before.byCategory.find((c: { category: string }) => c.category === 'TRANSPORT')?.budgetXof ?? 18000;

    await loginAsSupervisor(page);
    await page.goto('/app/finances');

    const section = page.getByTestId('budget-forecast-section');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const editButton = page.getByTestId('budget-edit-button');
    await expect(editButton).toBeVisible();
    await expect(editButton).toHaveText('Éditer le budget');
    await expect(editButton).toBeEnabled();

    await editButton.click();
    await expect(page.getByText('Budget prévisionnel du mois')).toBeVisible();

    const amount = unique();
    const input = page.locator('xpath=//label[text()="Transport"]/following-sibling::input');
    await input.fill(String(amount));
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    try {
      await expect(page.getByText('Budget mis à jour.')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Budget prévisionnel du mois')).toHaveCount(0);
      await expect(page.getByTestId('budget-row-TRANSPORT').getByText(`Budget : ${amount.toLocaleString('fr-FR')}`, { exact: false }))
        .toBeVisible({ timeout: 10_000 });
    } finally {
      // Restore, regardless of pass/fail, so other specs' fixed-default
      // assertions for TRANSPORT keep holding on the next run.
      await request.put(`${API_BASE}/finances/budget-lines`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { category: 'TRANSPORT', month: now.getMonth() + 1, year: now.getFullYear(), budgetXof: originalAmount },
      });
    }
  });

  test('DIRECTOR sees no budget editing controls at all — no button, no icon, nothing disabled', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    const section = page.getByTestId('budget-forecast-section');
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Budget prévisionnel')).toBeVisible();

    // Hidden completely, not just disabled — this is the requirement:
    // "Do not leave disabled buttons."
    await expect(page.getByTestId('budget-edit-button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Éditer le budget' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modifier le budget' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: /éditer|modifier|enregistrer/i })).toHaveCount(0);

    // The modal itself is unreachable — nothing on the page can open it.
    await expect(page.getByText('Budget prévisionnel du mois')).toHaveCount(0);

    // DIRECTOR still has full read access to the rest of the page.
    await expect(page.getByTestId('finance-kpi-budget-restant')).toBeVisible();
    await expect(page.getByText('Dépenses par catégorie')).toBeVisible();
    await expect(page.getByText('Comparatif mensuel')).toBeVisible();
  });

  test('DIRECTOR editing the budget via a direct API call still gets 403 (defense in depth, not just hidden UI)', async ({ request }) => {
    const token = await directorToken(request);
    const now = new Date();
    const res = await request.put(`${API_BASE}/finances/budget-lines`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { category: 'TRANSPORT', month: now.getMonth() + 1, year: now.getFullYear(), budgetXof: 1000 },
    });
    expect(res.status()).toBe(403);
  });

  test('SUPERVISOR editing the budget via a direct API call succeeds', async ({ request }) => {
    const token = await supervisorToken(request);
    const now = new Date();
    const res = await request.put(`${API_BASE}/finances/budget-lines`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { category: 'TRANSPORT', month: now.getMonth() + 1, year: now.getFullYear(), budgetXof: unique() },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('Finance — "Budget restant" KPI icon', () => {
  test('shows a Wallet icon (remaining balance), not the old upward TrendingUp arrow', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    const card = page.getByTestId('finance-kpi-budget-restant');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Budget restant')).toBeVisible();
    await expect(card.locator('svg.lucide-wallet')).toHaveCount(1);
    await expect(card.locator('svg.lucide-trending-up')).toHaveCount(0);

    // Color/palette unchanged — same blue/neutral as before, icon swap only.
    const icon = page.getByTestId('finance-kpi-budget-restant-icon');
    await expect(icon).toHaveCSS('color', 'rgb(62, 90, 120)');

    // The other two KPI cards are untouched — same icons as before, proving
    // this was a scoped, single-card change.
    await expect(page.getByTestId('finance-kpi-solde-caisse').locator('svg.lucide-trending-up')).toHaveCount(1);
    await expect(page.getByTestId('finance-kpi-depenses-mois').locator('svg.lucide-trending-down')).toHaveCount(1);
  });

  test('same Wallet icon for SUPERVISOR — icon is role-independent', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/finances');

    const card = page.getByTestId('finance-kpi-budget-restant');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('svg.lucide-wallet')).toHaveCount(1);
  });
});

// Terminology-only change: "Solde caisse" → "Budget total" on the first KPI
// card (testid finance-kpi-solde-caisse, kept as-is — an internal hook, not
// visible UI text). The underlying field (dashboard.soldeCaisseXof/Eur) and
// its value are unchanged; only the label text.
test.describe('Finance — "Budget total" label (was "Solde caisse")', () => {
  test('the Finance page displays "Budget total"', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    const card = page.getByTestId('finance-kpi-solde-caisse');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Budget total', { exact: true })).toBeVisible();
  });

  test('"Solde caisse" no longer appears anywhere on the page', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByTestId('finance-kpi-solde-caisse')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Solde caisse')).toHaveCount(0);
    await expect(page.getByText('caisse', { exact: false })).toHaveCount(0);
  });

  test('the displayed value is unchanged — matches soldeCaisseXof from the API, just under the new label', async ({ page, request }) => {
    const token = await directorToken(request);
    const now = new Date();
    const dashboard = await request.get(
      `${API_BASE}/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    const expectedValue = `${Math.round(dashboard.soldeCaisseXof).toLocaleString('fr-FR')} FCFA`;

    await loginAsDirector(page);
    await page.goto('/app/finances');
    const card = page.getByTestId('finance-kpi-solde-caisse');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText(expectedValue);
  });
});

test.describe('Finance page — renders correctly, no layout regressions', () => {
  test('DIRECTOR: dashboard, budget, charts and expenses all render together', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');

    await expect(page.getByText('Finances & Budget')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finance-kpi-solde-caisse')).toBeVisible();
    await expect(page.getByTestId('finance-kpi-depenses-mois')).toBeVisible();
    await expect(page.getByTestId('finance-kpi-budget-restant')).toBeVisible();
    await expect(page.getByText('Dépenses par catégorie')).toBeVisible();
    await expect(page.getByText('Comparatif mensuel')).toBeVisible();
    await expect(page.getByTestId('budget-forecast-section')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('SUPERVISOR: same layout, with the edit control present, no overflow', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/finances');

    await expect(page.getByText('Finances & Budget')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('budget-edit-button')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe('Finance page — mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('DIRECTOR: no horizontal overflow and no editing controls on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/finances');
    await expect(page.getByTestId('budget-forecast-section')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('budget-edit-button')).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('SUPERVISOR: edit button reachable and no horizontal overflow on mobile', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/finances');
    await expect(page.getByTestId('budget-edit-button')).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
