import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Administration', () => {
  test('shows all Module 4 section cards and navigates into one', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/administration');

    await expect(page.getByText('Locaux et espaces')).toBeVisible();
    await expect(page.getByText('Tickets de maintenance')).toBeVisible();
    await expect(page.getByText('Contrats fournisseurs')).toBeVisible();
    await expect(page.getByText('Démarches administratives')).toBeVisible();
    await expect(page.getByText('Stocks et inventaire')).toBeVisible();
    await expect(page.getByText("Registre d'entrées/sorties")).toBeVisible();

    await page.getByText('Locaux et espaces').click();
    await expect(page).toHaveURL(/\/app\/locaux-espaces/);
  });
});
