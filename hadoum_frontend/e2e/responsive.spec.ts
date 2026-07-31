import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Responsive layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile viewport has no horizontal overflow and exposes a menu toggle', async ({
    page,
  }) => {
    await loginAsDirector(page);
    await page.goto('/app/dashboard');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible();
  });
});
