import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

// "Registre d'entrées/sorties" was removed from Administration & Locaux
// (Director/Supervisor menu simplification) and /app/registre-entrees-sorties
// now redirects to /app/administration for everyone — RegistreEntreesSortiesPage,
// its backend module/API, and this suite are preserved for reuse once/if the
// route is wired back up; skipped rather than deleted.
test.describe.skip('Module 4 — Registre d\'entrées/sorties', () => {
  test('DIRECTOR creates a visitor entry and sees it in the presence list', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/registre-entrees-sorties');

    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();

    const uniqueName = `Playwright Visiteur ${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(uniqueName);
    await page.locator('textarea').first().fill('Test Playwright');

    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByText('Enregistrement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName)).toBeVisible();
  });
});
