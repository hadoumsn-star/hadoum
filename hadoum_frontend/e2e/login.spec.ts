import { test, expect } from '@playwright/test';
import { DIRECTOR_CREDENTIALS, login } from './helpers';

test.describe('Login', () => {
  test('rejects invalid credentials with an error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('prenom.nom@hadoum.org').fill('wrong@example.com');
    await page.getByPlaceholder('••••••••').fill('wrong-password');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/incorrect|invalide|erreur/i)).toBeVisible({ timeout: 10_000 });
  });

  test('logs in with valid DIRECTOR credentials and reaches the app', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await expect(page.getByRole('button', { name: /Hadoum/i })).toBeVisible();
  });

  test('redirects unauthenticated users away from a protected route', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
