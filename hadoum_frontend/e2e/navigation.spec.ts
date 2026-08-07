import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Navigation', () => {
  test('sidebar links navigate to their pages', async ({ page }) => {
    await loginAsDirector(page);

    await page.getByRole('link', { name: 'Voir les enfants' }).click();
    await expect(page).toHaveURL(/\/app\/children/);

    await page.getByRole('link', { name: 'Administration & Locaux' }).click();
    await expect(page).toHaveURL(/\/app\/administration/);

    await page.getByRole('link', { name: 'Suivi des incidents' }).click();
    await expect(page).toHaveURL(/\/app\/incidents/);
  });

  test('logout returns to the login page', async ({ page }) => {
    await loginAsDirector(page);
    await page.getByRole('button', { name: /Hadoum/i }).click();
    await page.getByText('Se déconnecter').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
