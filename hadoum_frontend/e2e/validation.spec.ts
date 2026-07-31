import { test, expect } from '@playwright/test';
import { loginAsDirector, loginAsSupervisor } from './helpers';

test.describe('Validation workflow (two-actor)', () => {
  test('DIRECTOR submits a sensitive goods movement; SUPERVISOR approves it', async ({
    browser,
  }) => {
    const directorContext = await browser.newContext();
    const directorPage = await directorContext.newPage();
    await loginAsDirector(directorPage);
    await directorPage.goto('/app/registre-entrees-sorties');
    await directorPage.getByRole('button', { name: 'Biens et marchandises' }).click();
    await directorPage.getByRole('button', { name: 'Nouveau mouvement' }).click();

    const description = `Playwright sortie test ${Date.now()}`;
    await directorPage.locator('select').first().selectOption('SORTIE_MARCHANDISE');
    await directorPage.locator('textarea').first().fill(description);
    await directorPage.locator('input[type="number"]').first().fill('80'); // above large-quantity threshold

    await directorPage.getByRole('button', { name: 'Créer' }).click();
    await expect(directorPage.getByText('Mouvement créé.')).toBeVisible({ timeout: 10_000 });
    await expect(directorPage.getByText(description)).toBeVisible();
    await expect(directorPage.getByText('EN ATTENTE DE VALIDATION').first()).toBeVisible();

    // A different actor (SUPERVISOR) approves it from a separate session.
    const supervisorContext = await browser.newContext();
    const supervisorPage = await supervisorContext.newPage();
    await loginAsSupervisor(supervisorPage);
    await supervisorPage.goto('/app/registre-entrees-sorties');
    await supervisorPage.getByRole('button', { name: 'Biens et marchandises' }).click();
    await expect(supervisorPage.getByText(description)).toBeVisible({ timeout: 10_000 });

    const row = supervisorPage
      .locator('xpath=//p[contains(text(), "' + description + '")]/ancestor::div[contains(@class,"rounded-xl")][1]');
    await row.getByText('Voir').click();
    await supervisorPage.getByRole('button', { name: 'Approuver' }).first().click();
    await supervisorPage.getByRole('button', { name: 'Approuver' }).last().click();

    await expect(supervisorPage.getByText('Décision enregistrée.')).toBeVisible({
      timeout: 10_000,
    });

    await directorContext.close();
    await supervisorContext.close();
  });
});
