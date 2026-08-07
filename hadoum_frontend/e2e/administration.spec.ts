import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Administration', () => {
  // "Tickets de maintenance" and "Registre d'entrées/sorties" were removed
  // from this hub (Director/Supervisor menu simplification) — see
  // supervisor.spec.ts for their redirect coverage. The remaining 4 cards
  // are unaffected.
  test('shows the remaining Module 4 section cards and navigates into one', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/administration');

    await expect(page.getByText('Locaux et espaces')).toBeVisible();
    await expect(page.getByText('Contrats fournisseurs')).toBeVisible();
    await expect(page.getByText('Démarches administratives')).toBeVisible();
    await expect(page.getByText('Stocks et inventaire')).toBeVisible();
    await expect(page.getByText('Tickets de maintenance')).toHaveCount(0);
    await expect(page.getByText("Registre d'entrées/sorties")).toHaveCount(0);

    await page.getByText('Locaux et espaces').click();
    await expect(page).toHaveURL(/\/app\/locaux-espaces/);
  });
});
