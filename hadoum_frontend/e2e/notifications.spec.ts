import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Notifications', () => {
  test('the notification bell is visible and clickable in the topbar', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const bell = page.getByRole('button', { name: 'Notifications', exact: true });
    await expect(bell).toBeVisible();
    await bell.click();
  });
});
