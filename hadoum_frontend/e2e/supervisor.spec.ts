import { test, expect } from '@playwright/test';
import { loginAsSupervisor } from './helpers';

test.describe('Supervisor dashboard', () => {
  test('shows the pending-requests panel and enforces read-only access', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/dashboard');

    await expect(page.getByText('Demandes à traiter')).toBeVisible();

    // Read-only enforcement: no create controls on a Module 4 operational page.
    await page.goto('/app/registre-entrees-sorties');
    await expect(page.getByRole('button', { name: 'Nouvel enregistrement' })).toHaveCount(0);
  });
});
