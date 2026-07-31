import { test, expect } from '@playwright/test';
import { loginAsDirector } from './helpers';

test.describe('Documents', () => {
  test('uploads a document to a visitor entry and views it', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/registre-entrees-sorties');

    await page.getByRole('button', { name: 'Nouvel enregistrement' }).click();
    const uniqueName = `Playwright Doc Test ${Date.now()}`;
    await page.getByPlaceholder('Ex : Amadou Diop').fill(uniqueName);
    await page.locator('textarea').first().fill('Test document upload');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Enregistrement créé.')).toBeVisible({ timeout: 10_000 });

    await page.getByText(uniqueName).click();
    await expect(page.getByText('DOCUMENTS')).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Ajouter un document').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Playwright test document'),
    });

    await expect(page.getByText('Document ajouté.')).toBeVisible({ timeout: 10_000 });
  });
});
