import { test, expect, APIRequestContext } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, loginAsDirector, loginAsEducator } from './helpers';

// PR 13: Audit Logs — generic, read-only audit trail page. Fixtures are
// created directly through covered modules' APIs (Incidents, Contacts) so
// each test drives a real audit entry through the real interceptor, then
// verifies it via the real AuditLogsPage UI.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function directorToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: DIRECTOR_CREDENTIALS });
  return (await res.json()).token as string;
}

async function apiCreateIncident(request: APIRequestContext, token: string, title: string) {
  const res = await request.post(`${API_BASE}/incidents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, type: 'AUTRE', description: 'e2e', signaledBy: 'e2e', priority: 'N3' },
  });
  return res.json();
}

test.describe('Audit Logs (PR 13)', () => {
  test('DIRECTOR sees a new entry appear after creating an incident', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('AuditIncident');
    await apiCreateIncident(request, token, title);

    await loginAsDirector(page);
    await page.goto('/app/audit-logs');
    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('Rechercher (entité, action, utilisateur)…').fill('Incident');
    await expect(page.getByText('Création').first()).toBeVisible({ timeout: 10_000 });
  });

  test('module filter narrows the list to a single module', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token, unique('ModuleFilter'));

    await loginAsDirector(page);
    await page.goto('/app/audit-logs');
    await page.getByTestId('audit-filter-module').selectOption('INCIDENTS');
    const rows = page.locator('[data-testid^="audit-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    // Scoped to rows, not the page — the header subtitle lists every
    // covered module by name regardless of the active filter.
    await expect(rows.getByText('FINANCES', { exact: true })).toHaveCount(0);
  });

  test('expanding an entry shows the before/after detail', async ({ page, request }) => {
    const token = await directorToken(request);
    const created = await apiCreateIncident(request, token, unique('ExpandDetail'));
    await request.patch(`${API_BASE}/incidents/${created.id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'EN_ATTENTE', note: 'e2e note' },
    });

    await loginAsDirector(page);
    await page.goto('/app/audit-logs');
    await page.getByTestId('audit-filter-module').selectOption('INCIDENTS');

    const row = page.locator('[data-testid^="audit-row-"]').filter({ hasText: 'Changement de statut' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(row.getByText('CHAMPS MODIFIÉS')).toBeVisible();
    await expect(row.getByText('status', { exact: true })).toBeVisible();
  });

  test('date range filter excludes entries outside the range', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateIncident(request, token, unique('DateRange'));

    await loginAsDirector(page);
    await page.goto('/app/audit-logs');

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId('audit-filter-date-from').fill(tomorrow);
    await expect(page.getByText('Aucune entrée ne correspond à ces filtres')).toBeVisible({ timeout: 10_000 });
  });

  // PR 25 — stale wording: AuditLogsPage's own `canView` guard
  // (src/app/pages/AuditLogsPage.tsx) is DIRECTOR-only, and its real
  // message has always read "Accès réservé à la direction." (no "et à la
  // supervision" — SUPERVISOR is denied by the exact same guard/message,
  // see supervisor.spec.ts's own "SUPERVISOR opening /app/audit-logs
  // directly sees the existing unauthorized message" test). This test's
  // expected string had drifted from that real, already-approved text.
  test('non-director roles see the access-restricted message', async ({ page }) => {
    await loginAsEducator(page);
    await page.goto('/app/audit-logs');
    await expect(page.getByText('Accès réservé à la direction.')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Audit Logs — mobile layout (PR 13)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('AuditLogsPage has no horizontal overflow on mobile', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/audit-logs');
    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible({ timeout: 10_000 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
