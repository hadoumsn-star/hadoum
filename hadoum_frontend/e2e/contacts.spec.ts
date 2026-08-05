import { test, expect, APIRequestContext } from '@playwright/test';
import {
  DIRECTOR_CREDENTIALS,
  EDUCATOR_CREDENTIALS,
  BOARD_CREDENTIALS,
  loginAsDirector,
  loginAsSupervisor,
  loginAsEducator,
  loginAsBoard,
} from './helpers';

// These specs drive the real app against the real backend (see
// playwright.config.ts). Fixture data (contacts, and — since PR 2 ships no
// deactivate control — deactivated contacts) is created directly through the
// Contact API via Playwright's `request` fixture, not through the UI; the UI
// itself is only ever exercised through ContactAutocomplete/ContactFormModal
// via the /app/contacts-demo harness, matching the "no consuming business
// page" constraint for this PR.
//
// ContactAutocomplete's dropdown (results, category chips, "Nouveau
// contact") renders through Radix Popover's Portal, i.e. appended to
// <body>, outside the demo page's `data-testid="demo-*"` section wrapper —
// so those elements are queried unscoped via `page.getByRole(...)`, not
// `section.getByRole(...)`. Everything that stays in normal document flow
// (the combobox input itself, the clear button, the selection preview) is
// still scoped to its `section` so multiple demo instances on the same page
// don't collide.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function uniquePhone(): string {
  return `77${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}

async function directorToken(request: APIRequestContext): Promise<string> {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}

// `force=true` because this is fixture setup, not a test of the duplicate
// workflow itself (that's covered separately, deliberately, by driving the
// UI). Without it, a fixed phone number reused by an earlier run of this
// suite would 409 here and this would silently return the *error* body
// instead of a created contact — `unique()` already keeps names distinct,
// but phone numbers are sometimes intentionally repeated on purpose (the
// duplicate-warning tests), so this must not depend on names alone.
async function apiCreateContact(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE}/contacts?force=true`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

async function apiDeactivate(request: APIRequestContext, token: string, id: string) {
  await request.patch(`${API_BASE}/contacts/${id}/deactivate`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiListCategories(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/contacts/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

test.describe('Contacts — ContactAutocomplete / ContactFormModal (PR 2)', () => {
  test('DIRECTOR can search contacts and results show the expected fields', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const category = categories[0];
    const name = unique('Recherche Basique');
    await apiCreateContact(request, token, {
      fullName: name,
      categoryId: category.id,
      organization: 'Structure Test',
      phone: '771112233',
    });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    await section.getByRole('combobox').fill(name);

    const option = page.getByRole('option', { name: new RegExp(name) });
    await expect(option).toBeVisible();
    await expect(option).toContainText('Structure Test');
    // The category badge renders its label uppercased (visual style only).
    await expect(option).toContainText(category.label.toUpperCase());
    await expect(option).toContainText('771112233');
  });

  test('category filtering restricts results to the selected category', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const fournisseur = categories.find((c: { key: string }) => c.key === 'FOURNISSEUR');
    const prestataire = categories.find((c: { key: string }) => c.key === 'PRESTATAIRE');
    // Shared run-unique token in both names, then search by it: the
    // suggestions list is unfiltered-by-search and ordered alphabetically,
    // so after repeated runs there can be many older fixture contacts
    // sorting ahead of "Filtre …" on a small page — searching for the
    // token keeps this deterministic regardless of how much other contact
    // data already exists.
    const runToken = unique('CatFilterRun');
    const nameF = `Filtre Fournisseur ${runToken}`;
    const nameP = `Filtre Prestataire ${runToken}`;
    await apiCreateContact(request, token, { fullName: nameF, categoryId: fournisseur.id });
    await apiCreateContact(request, token, { fullName: nameP, categoryId: prestataire.id });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    // Section 2 is already scoped to FOURNISSEUR + PRESTATAIRE (categoryKeys prop).
    const section = page.getByTestId('demo-scoped');
    await section.getByRole('combobox').fill(runToken);
    await expect(page.getByRole('option', { name: new RegExp(nameF) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(nameP) })).toBeVisible();

    await page.getByRole('button', { name: 'Fournisseur' }).click();
    await expect(page.getByRole('option', { name: new RegExp(nameF) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(nameP) })).toHaveCount(0);
  });

  test('keyboard navigation highlights results and Enter selects the highlighted one', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const name = unique('Clavier Contact');
    await apiCreateContact(request, token, { fullName: name, categoryId: categories[0].id });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const input = section.getByRole('combobox');
    await input.fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) })).toBeVisible();

    await input.press('ArrowDown');
    await input.press('Enter');

    await expect(input).toHaveValue(name);
    await expect(section.getByTestId('selection-json')).toContainText(name);
  });

  test('a selected contact can be cleared', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const name = unique('Effacer Contact');
    await apiCreateContact(request, token, { fullName: name, categoryId: categories[0].id });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const input = section.getByRole('combobox');
    await input.fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await expect(input).toHaveValue(name);

    await section.getByRole('button', { name: 'Effacer la sélection' }).click();
    await expect(input).toHaveValue('');
    await expect(section.getByText('Aucune sélection.')).toBeVisible();
  });

  test('inline contact creation automatically selects the new contact', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const input = section.getByRole('combobox');
    const name = unique('Création Inline');
    await input.fill(name);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    await expect(page.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(page.locator('#contact-form-fullName')).toHaveValue(name);

    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('heading', { name: 'Nouveau contact' })).toHaveCount(0);
    await expect(input).toHaveValue(name);
    await expect(section.getByTestId('selection-json')).toContainText(name);
  });

  test('shows a probable-duplicate warning and "Utiliser ce contact" selects the existing contact', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const phone = uniquePhone();
    const existingName = unique('Existant Dup');
    await apiCreateContact(request, token, { fullName: existingName, categoryId: categories[0].id, phone });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const input = section.getByRole('combobox');
    const newName = unique('Nouveau Dup');
    await input.fill(newName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    await page.locator('#contact-form-fullName').fill(newName);
    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await page.locator('#contact-form-phone').fill(phone);
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('heading', { name: 'Contact similaire trouvé' })).toBeVisible();
    await expect(page.getByText(existingName)).toBeVisible();

    await page.getByRole('button', { name: 'Utiliser ce contact' }).click();

    await expect(page.getByRole('heading', { name: 'Contact similaire trouvé' })).toHaveCount(0);
    await expect(input).toHaveValue(existingName);
    await expect(section.getByTestId('selection-json')).toContainText(existingName);
  });

  test('"Créer quand même" overrides the duplicate warning and creates a new contact', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const phone = uniquePhone();
    const existingName = unique('Existant Force');
    await apiCreateContact(request, token, { fullName: existingName, categoryId: categories[0].id, phone });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const input = section.getByRole('combobox');
    const newName = unique('Nouveau Force');
    await input.fill(newName);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    await page.locator('#contact-form-fullName').fill(newName);
    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await page.locator('#contact-form-phone').fill(phone);
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('heading', { name: 'Contact similaire trouvé' })).toBeVisible();
    await page.getByRole('button', { name: 'Créer quand même' }).click();

    await expect(page.getByRole('heading', { name: 'Contact similaire trouvé' })).toHaveCount(0);
    await expect(input).toHaveValue(newName);
    await expect(section.getByTestId('selection-json')).toContainText(newName);
  });

  test('rejects submission with invalid (missing) required fields', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    await section.getByRole('combobox').click();
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByText('Le nom du contact est requis.')).toBeVisible();
    await expect(page.getByText('La catégorie est requise.')).toBeVisible();
    // Never reaches the API — the modal itself is still open.
    await expect(page.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
  });

  test('rejects an invalid email', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    await section.getByRole('combobox').click();
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    await page.locator('#contact-form-fullName').fill(unique('Email Invalide'));
    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await page.locator('#contact-form-email').fill('not-an-email');
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible();
  });

  test('an inactive contact cannot be found through search for a new selection', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const name = unique('Inactif Recherche');
    const created = await apiCreateContact(request, token, { fullName: name, categoryId: categories[0].id });
    await apiDeactivate(request, token, created.id);

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    await section.getByRole('combobox').fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) })).toHaveCount(0);
    await expect(page.getByText('Aucun contact trouvé.')).toBeVisible();
  });

  test('an inactive previously-selected contact remains visible with an "Inactif" badge', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const name = unique('Inactif Precharge');
    const created = await apiCreateContact(request, token, { fullName: name, categoryId: categories[0].id });
    await apiDeactivate(request, token, created.id);

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-inactive');
    await section.getByTestId('preload-contact-id').fill(created.id);
    await section.getByTestId('preload-contact-submit').click();

    await expect(section.getByText('CONTACT INACTIF', { exact: true })).toBeVisible();
    await expect(section.getByTestId('selection-json')).toContainText(name);
  });

  test('SUPERVISOR can create and edit contacts', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    const name = unique('Superviseur Create');
    await section.getByRole('combobox').fill(name);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();
    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(section.getByTestId('selection-json')).toContainText(name);

    // Edit the just-created contact.
    await section.getByRole('button', { name: 'Modifier ce contact' }).click();
    await expect(page.getByRole('heading', { name: 'Modifier le contact' })).toBeVisible();
    const editedName = `${name} (modifié)`;
    await page.locator('#contact-form-fullName').fill(editedName);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { name: 'Modifier le contact' })).toHaveCount(0);
    await expect(section.getByTestId('selection-json')).toContainText(editedName);
  });

  test('no deactivate or category-management controls appear anywhere in PR 2 components', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const name = unique('Aucun Controle');
    await apiCreateContact(request, token, { fullName: name, categoryId: categories[0].id });

    await loginAsDirector(page);
    await page.goto('/app/contacts-demo');

    const section = page.getByTestId('demo-basic');
    await section.getByRole('combobox').fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) })).toBeVisible();

    await expect(page.getByRole('button', { name: /Désactiver/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Réactiver/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Nouvelle catégorie/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Gérer les catégories/ })).toHaveCount(0);

    await page.getByRole('option', { name: /Nouveau contact/ }).click();
    await expect(page.getByRole('button', { name: /Désactiver/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Nouvelle catégorie/ })).toHaveCount(0);
    // `active` is never exposed as an editable field on the create/edit form.
    await expect(page.locator('#contact-form-active')).toHaveCount(0);
  });

  test('EDUCATOR and BOARD cannot access the contacts harness page or the contact API', async ({ page, request }) => {
    // The topbar account button's accessible name is "{initials} {first
    // name} {roleLabel}" (see Topbar.tsx) — "Hadoum" only appears there for
    // the hadoum@gmail.com DIRECTOR seed account, not for these two, so each
    // is matched by its own seeded first name instead.
    const accounts = [
      { login: loginAsEducator, nameFragment: /Éducateur/ },
      { login: loginAsBoard, nameFragment: /Membre/ },
    ];
    for (const { login, nameFragment } of accounts) {
      await login(page);
      await page.goto('/app/contacts-demo');
      await expect(page.getByTestId('contacts-demo-forbidden')).toBeVisible();

      await page.getByRole('button', { name: nameFragment }).click();
      await page.getByText('Se déconnecter').click();
      await expect(page).toHaveURL(/\/login/);
    }

    const educatorToken = await apiLogin(request, EDUCATOR_CREDENTIALS.email, EDUCATOR_CREDENTIALS.password);
    const educatorRes = await request.get(`${API_BASE}/contacts`, {
      headers: { Authorization: `Bearer ${educatorToken}` },
    });
    expect(educatorRes.status()).toBe(403);

    const boardToken = await apiLogin(request, BOARD_CREDENTIALS.email, BOARD_CREDENTIALS.password);
    const boardRes = await request.get(`${API_BASE}/contacts`, {
      headers: { Authorization: `Bearer ${boardToken}` },
    });
    expect(boardRes.status()).toBe(403);
  });
});
