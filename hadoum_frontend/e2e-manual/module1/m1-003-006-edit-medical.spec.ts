import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module1');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function trackFailedRequests(page: Page): { url: string; method: string; status: number }[] {
  const failures: { url: string; method: string; status: number }[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      failures.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });
  return failures;
}

async function createMinimalChild(page: Page, lastName: string) {
  await page.getByRole('button', { name: 'Ajouter un enfant' }).click();
  await page.getByPlaceholder('Amine').fill('TEST-E2E-Prenom');
  await page.getByPlaceholder('Belarbi').fill(lastName);
  await page.getByPlaceholder('JJ/MM/AAAA').first().fill('10/03/2016');
  await page.getByRole('button', { name: /continuer/i }).click();
  await page.getByRole('button', { name: /continuer/i }).click();
  await page.getByRole('button', { name: /continuer/i }).click();
  await page.getByRole('button', { name: /enregistrer/i }).click();
  await expect(page.getByRole('button', { name: 'Ajouter un enfant' })).toBeVisible({ timeout: 15_000 });
}

async function openChildFiche(page: Page, lastName: string) {
  await page.getByPlaceholder('Rechercher un enfant…').fill(lastName);
  await page.getByText(lastName).first().click();
}

test.describe('M1-005 — Edit a child, persistence across refresh', () => {
  test('Famille tab: situationFamiliale / lieuVie / derniereVisite persistence', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/children');

    const lastName = `TEST-E2E-Famille-${Date.now()}`;
    await createMinimalChild(page, lastName);
    await openChildFiche(page, lastName);
    await snap(page, 'm1005-fiche-opened');

    await page.getByRole('button', { name: 'Famille' }).click();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await snap(page, 'm1005-famille-editing');

    const situationSelect = page.locator('text=Situation familiale').locator('..').locator('select');
    await situationSelect.selectOption('Demi-orphelin');
    const lieuVieInput = page.locator('text=Lieu de vie (famille)').locator('..').locator('input');
    await lieuVieInput.fill('TEST-E2E-LieuDeVie');
    const derniereVisiteInput = page.locator('text=Date dernière visite familiale').locator('..').locator('input');
    await derniereVisiteInput.fill('TEST-E2E-01 Jan 2026');
    const compositionTextarea = page.locator('text=Composition familiale').locator('..').locator('textarea');
    await compositionTextarea.fill('TEST-E2E-Composition familiale modifiée');
    await snap(page, 'm1005-famille-filled');

    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible({ timeout: 10_000 });
    await snap(page, 'm1005-famille-saved');

    // Refresh the whole page and re-open the fiche to verify true persistence
    await page.reload();
    await expect(page.getByText('Dossiers enfants')).toBeVisible({ timeout: 10_000 });
    await openChildFiche(page, lastName);
    await page.getByRole('button', { name: 'Famille' }).click();
    await snap(page, 'm1005-famille-after-refresh');

    const situationValue = await page.locator('text=Situation familiale').locator('..').locator('select').inputValue();
    const lieuVieValue = await page.locator('text=Lieu de vie (famille)').locator('..').locator('input').inputValue();
    const derniereVisiteValue = await page.locator('text=Date dernière visite familiale').locator('..').locator('input').inputValue();
    const compositionValue = await page.locator('text=Composition familiale').locator('..').locator('textarea').inputValue();

    console.log('PERSISTENCE_CHECK famille', JSON.stringify({ situationValue, lieuVieValue, derniereVisiteValue, compositionValue }));

    expect(compositionValue).toContain('TEST-E2E-Composition familiale modifiée'); // expected to persist
    // The following are the fields suspected NOT to persist (frontend never sends them to the API):
    expect(lieuVieValue, 'Lieu de vie should persist after refresh').toBe('TEST-E2E-LieuDeVie');
    expect(derniereVisiteValue, 'Date dernière visite should persist after refresh').toBe('TEST-E2E-01 Jan 2026');
    expect(situationValue, 'Situation familiale should persist after refresh').toBe('Demi-orphelin');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });

  test('Scolarité tab: resultatsMatieres / assiduiteNote / observationsEnseignant persistence', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/children');

    const lastName = `TEST-E2E-Scolarite-${Date.now()}`;
    await createMinimalChild(page, lastName);
    await openChildFiche(page, lastName);

    await page.getByRole('button', { name: 'Scolarité' }).click();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await snap(page, 'm1005-scolarite-editing');

    const etablissementInput = page.locator('text=Établissement').locator('..').locator('input');
    await etablissementInput.fill('TEST-E2E-Ecole Primaire');
    const resultatsTextarea = page.locator('text=Résultats par matière').locator('..').locator('textarea');
    await resultatsTextarea.fill('TEST-E2E-Français 14/20, Maths 16/20');
    const assiduiteInput = page.locator('text=Assiduité').locator('..').locator('input');
    await assiduiteInput.fill('TEST-E2E-95% de présence');
    const obsTextarea = page.locator('text=Observations enseignant').locator('..').locator('textarea');
    await obsTextarea.fill('TEST-E2E-Bon comportement en classe');
    await snap(page, 'm1005-scolarite-filled');

    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText('Dossiers enfants')).toBeVisible({ timeout: 10_000 });
    await openChildFiche(page, lastName);
    await page.getByRole('button', { name: 'Scolarité' }).click();
    await snap(page, 'm1005-scolarite-after-refresh');

    const etablissementValue = await page.locator('text=Établissement').locator('..').locator('input').inputValue();
    const resultatsValue = await page.locator('text=Résultats par matière').locator('..').locator('textarea').inputValue();
    const assiduiteValue = await page.locator('text=Assiduité').locator('..').locator('input').inputValue();
    const obsValue = await page.locator('text=Observations enseignant').locator('..').locator('textarea').inputValue();

    console.log('PERSISTENCE_CHECK scolarite', JSON.stringify({ etablissementValue, resultatsValue, assiduiteValue, obsValue }));

    expect(etablissementValue, 'Établissement should persist (sent via upsertSchool)').toBe('TEST-E2E-Ecole Primaire');
    expect(resultatsValue, 'Résultats par matière should persist after refresh').toBe('TEST-E2E-Français 14/20, Maths 16/20');
    expect(assiduiteValue, 'Assiduité should persist after refresh').toBe('TEST-E2E-95% de présence');
    expect(obsValue, 'Observations enseignant should persist after refresh').toBe('TEST-E2E-Bon comportement en classe');
  });
});

test.describe('M1-006 — Medical record', () => {
  test('Add blood type, allergies, treatments; verify persistence after refresh', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await login(page, DIRECTOR_CREDENTIALS);
    await page.goto('/app/children');

    const lastName = `TEST-E2E-Medical-${Date.now()}`;
    await createMinimalChild(page, lastName);
    await openChildFiche(page, lastName);

    await page.getByRole('button', { name: 'Santé' }).click();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await snap(page, 'm1006-sante-editing');

    await page.locator('select').first().selectOption('O+');
    const allergiesInput = page.locator('text=Allergies connues').locator('..').locator('input');
    await allergiesInput.fill('TEST-E2E-Pénicilline');
    const vaccinTextarea = page.locator('text=Vaccinations (dates)').locator('..').locator('textarea');
    await vaccinTextarea.fill('TEST-E2E-BCG 2020, Hépatite B 2021');
    const traitementsTextarea = page.locator('text=Traitements en cours').locator('..').locator('textarea');
    await traitementsTextarea.fill('TEST-E2E-Paracétamol si fièvre');
    const consultationsTextarea = page.locator('text=Consultations médicales').locator('..').locator('textarea');
    await consultationsTextarea.fill('TEST-E2E-Consultation générale 05/2026');
    await snap(page, 'm1006-sante-filled');

    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText('Dossiers enfants')).toBeVisible({ timeout: 10_000 });
    await openChildFiche(page, lastName);
    await page.getByRole('button', { name: 'Santé' }).click();
    await snap(page, 'm1006-sante-after-refresh');

    const bloodType = await page.locator('select').first().inputValue();
    const allergies = await page.locator('text=Allergies connues').locator('..').locator('input').inputValue();
    const vaccinations = await page.locator('text=Vaccinations (dates)').locator('..').locator('textarea').inputValue();
    const traitements = await page.locator('text=Traitements en cours').locator('..').locator('textarea').inputValue();
    const consultations = await page.locator('text=Consultations médicales').locator('..').locator('textarea').inputValue();

    expect(bloodType).toBe('O+');
    expect(allergies).toBe('TEST-E2E-Pénicilline');
    expect(vaccinations).toBe('TEST-E2E-BCG 2020, Hépatite B 2021');
    expect(traitements).toBe('TEST-E2E-Paracétamol si fièvre');
    expect(consultations).toBe('TEST-E2E-Consultation générale 05/2026');

    expect(failures, `Failed API calls: ${JSON.stringify(failures)}`).toEqual([]);
  });
});
