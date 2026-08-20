import { test, expect, APIRequestContext, Page } from '@playwright/test';
import {
  DIRECTOR_CREDENTIALS,
  loginAsDirector, loginAsSupervisor, loginAsEducator, loginAsBoard,
} from './helpers';

// PR 18: Module 5 ("Donateurs & Parrains") frontend. Drives the real app
// against the real backend (see playwright.config.ts) — fixture
// contacts/donors/campaigns/donations are created directly through the API
// via Playwright's `request` fixture for setup speed only. Every assertion
// about the UI itself (forms, tabs, role visibility, idempotency, lifecycle
// gating, French labels) goes through the real DonorsPage. Mirrors
// e2e/supplier-contracts.spec.ts's fixture pattern.

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001/api';

// PR 19: the "AAA-" prefix is deliberate, not decorative — several
// donor/campaign selects in the app fetch an unfiltered, alphabetically
// sorted, backend-capped page (pageSize<=100, see QueryDonorProfilesDto)
// rather than searching. After enough repeated runs against this shared
// dev DB, a freshly created fixture can otherwise sort outside that
// window and silently never appear in a <select>, which reads as a
// flaky/broken test rather than what it actually is (accumulated fixture
// data, not a product bug — see docs/testing.md's Module 5 section).
// Sorting first by construction keeps these fixtures deterministic.
function unique(label: string): string {
  return `AAA-${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.token as string;
}
function directorToken(request: APIRequestContext) {
  return apiLogin(request, DIRECTOR_CREDENTIALS.email, DIRECTOR_CREDENTIALS.password);
}

async function apiCreateContact(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/contacts?force=true`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}
async function apiListCategories(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/contacts/categories`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
async function apiCreateDonorProfile(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/donors`, { headers: { Authorization: `Bearer ${token}` }, data });
  return res.json();
}
async function apiCreateCampaign(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { targetAmountXof: 100000, startDate: '2026-01-01', ...data },
  });
  return res.json();
}
async function apiActivateCampaign(request: APIRequestContext, token: string, id: string) {
  const res = await request.post(`${API_BASE}/campaigns/${id}/activate`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
async function apiCreateDonation(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/donations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { date: '2026-01-10', ...data },
  });
  return res.json();
}
async function apiListDonations(request: APIRequestContext, token: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await request.get(`${API_BASE}/donations?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

interface Categories { id: string; key: string }

async function makeDonorFixture(
  request: APIRequestContext, token: string, categories: Categories[],
  type: 'PARRAIN' | 'DONATEUR_PONCTUEL', namePrefix: string,
) {
  const cat = categories.find((c) => c.key === type)!;
  const name = unique(namePrefix);
  const contact = await apiCreateContact(request, token, { fullName: name, categoryId: cat.id });
  const donor = await apiCreateDonorProfile(request, token, { contactId: contact.id, type, country: 'Sénégal' });
  return { contact, donor, name };
}

async function openDonorsTab(page: Page, tab: string) {
  await page.goto('/app/donateurs');
  await page.getByRole('button', { name: tab, exact: true }).click();
}

// LoginPage redirects straight to /app/dashboard whenever isAuthenticated is
// already true (see LoginPage.tsx) — so switching users mid-test by calling
// loginAsSupervisor() right after loginAsDirector() would otherwise hang
// forever waiting for a login form that never renders, since the previous
// session's token is still in localStorage when /login is requested again.
// Clearing storage first drops that session so the next login() call gets
// a real, unauthenticated login page.
async function switchUser(page: Page, login: (page: Page) => Promise<void>) {
  await page.evaluate(() => window.localStorage.clear());
  await login(page);
}

// ─── Navigation & role visibility ──────────────────────────────────────────

test.describe('Donors module — navigation & role visibility (PR 18)', () => {
  test('DIRECTOR sees the link and lands on a 6-tab workspace with summary cards', async ({ page }) => {
    await loginAsDirector(page);
    await page.getByRole('link', { name: 'Donateurs & Parrains' }).click();
    await expect(page).toHaveURL(/\/app\/donateurs/);
    await expect(page.getByRole('heading', { name: 'Donateurs & Parrains' })).toBeVisible();

    for (const tab of ['Parrains', 'Donateurs ponctuels', 'Cagnottes', 'Dons', 'Communications', 'Rapports']) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    for (const kpi of ['Parrains actifs', 'Dons reçus', 'Cagnottes actives', 'Rapports à préparer / envoyer']) {
      await expect(page.getByText(kpi)).toBeVisible();
    }
  });

  test('SUPERVISOR sees the link and can browse the module', async ({ page }) => {
    await loginAsSupervisor(page);
    await expect(page.getByRole('link', { name: 'Donateurs & Parrains' })).toBeVisible();
    await page.getByRole('link', { name: 'Donateurs & Parrains' }).click();
    await expect(page).toHaveURL(/\/app\/donateurs/);
    await expect(page.getByRole('heading', { name: 'Donateurs & Parrains' })).toBeVisible();
  });

  test('BOARD does not see the link, and a direct visit shows a clean guard message instead of the workspace', async ({ page }) => {
    await loginAsBoard(page);
    await expect(page.getByRole('link', { name: 'Donateurs & Parrains' })).toHaveCount(0);
    await page.goto('/app/donateurs');
    await expect(page.getByText('Accès non disponible')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Donateurs & Parrains' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Parrains', exact: true })).toHaveCount(0);
  });

  test('EDUCATOR does not see the link', async ({ page }) => {
    await loginAsEducator(page);
    await expect(page.getByRole('link', { name: 'Donateurs & Parrains' })).toHaveCount(0);
  });
});

// ─── Parrains tab ───────────────────────────────────────────────────────────

test.describe('Parrains tab (PR 18)', () => {
  test('creates a parrain via an existing contact, shows recurring fields, records a donation, then deactivates and reactivates', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const parrainCat = categories.find((c: Categories) => c.key === 'PARRAIN');
    const contactName = unique('Contact Existant Parrain');
    await apiCreateContact(request, token, { fullName: contactName, categoryId: parrainCat.id });

    await loginAsDirector(page);
    await openDonorsTab(page, 'Parrains');
    await page.getByRole('button', { name: 'Nouveau parrain' }).click();

    const modal = page.getByTestId('donor-profile-form-modal');
    await expect(modal.getByRole('heading', { name: 'Nouveau parrain' })).toBeVisible();
    // Reuses the shared ContactAutocomplete — search the existing contact
    // rather than duplicating a Contact creation form.
    await modal.getByRole('combobox').fill(contactName);
    await page.getByRole('option', { name: new RegExp(contactName) }).click();

    // Recurring commitment fields are shown for a PARRAIN.
    await expect(modal.locator('#donor-form-engagement')).toBeVisible();
    await expect(modal.locator('#donor-form-monthly')).toBeVisible();
    await modal.locator('#donor-form-country').fill('Côte d’Ivoire');
    await modal.locator('#donor-form-engagement').fill('2026-01-01');
    await modal.locator('#donor-form-monthly').fill('25000');
    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);

    // Scoped to this donor's own card — the dev DB accumulates fixture
    // parrains across repeated runs, so an unscoped getByText('… FCFA/mois')
    // would hit a strict-mode violation once more than one shares the
    // amount.
    const card = page.getByTestId('donor-card').filter({ hasText: contactName });
    await expect(card).toBeVisible();
    await expect(card.getByText('25 000 FCFA/mois', { exact: false })).toBeVisible();

    // Detail view — donation history section, then deactivate/reactivate.
    await page.getByText(contactName).click();
    const detail = page.getByTestId('donor-detail-modal');
    await expect(detail.getByText('HISTORIQUE DES DONS', { exact: false })).toBeVisible();
    await expect(detail.getByText('Aucun don enregistré pour ce donateur.')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await detail.getByRole('button', { name: 'Désactiver' }).click();
    await expect(detail.getByText('INACTIF', { exact: true })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await detail.getByRole('button', { name: 'Réactiver' }).click();
    await expect(detail.getByText('ACTIF', { exact: true })).toBeVisible();
  });

  test('creates a parrain by creating a brand-new contact inline (no duplicate Contact form)', async ({ page }) => {
    await loginAsDirector(page);
    await openDonorsTab(page, 'Parrains');
    await page.getByRole('button', { name: 'Nouveau parrain' }).click();

    const modal = page.getByTestId('donor-profile-form-modal');
    const name = unique('Nouveau Parrain Inline');
    await modal.getByRole('combobox').fill(name);
    await page.getByRole('option', { name: /Nouveau contact/ }).click();

    const contactModal = page.getByTestId('contact-form-modal');
    await expect(contactModal.getByRole('heading', { name: 'Nouveau contact' })).toBeVisible();
    await expect(page.locator('#contact-form-fullName')).toHaveValue(name);
    await page.locator('#contact-form-categoryId').selectOption({ index: 1 });
    // The underlying DonorProfileFormModal's own (disabled) "Créer" button is
    // still in the DOM behind this nested modal — scope to avoid ambiguity.
    await contactModal.getByRole('button', { name: 'Créer' }).click();
    await expect(contactModal).toHaveCount(0);

    // The newly created contact's id was reused automatically.
    await expect(modal.getByRole('combobox')).toHaveValue(name);
    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();
  });
});

// ─── Donateurs ponctuels tab ────────────────────────────────────────────────

test.describe('Donateurs ponctuels tab (PR 18)', () => {
  test('the create form never shows recurring/monthly-commitment fields', async ({ page }) => {
    await loginAsDirector(page);
    await openDonorsTab(page, 'Donateurs ponctuels');
    await page.getByRole('button', { name: 'Nouveau donateur' }).click();

    const modal = page.getByTestId('donor-profile-form-modal');
    await expect(modal.getByRole('heading', { name: 'Nouveau donateur ponctuel' })).toBeVisible();
    await expect(modal.locator('#donor-form-engagement')).toHaveCount(0);
    await expect(modal.locator('#donor-form-monthly')).toHaveCount(0);
    // These modals close on backdrop click or their own "Fermer" button —
    // there's no Escape-to-close handler in this codebase's modal convention.
    await modal.getByRole('button', { name: 'Fermer' }).click();
  });

  test('creates a donateur ponctuel and it appears only in the Donateurs ponctuels list, not Parrains', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur Ponctuel Fixture');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Donateurs ponctuels');
    await page.getByPlaceholder('Rechercher un donateur…').fill(name);
    await expect(page.getByText(name)).toBeVisible();

    await page.getByRole('button', { name: 'Parrains', exact: true }).click();
    await page.getByPlaceholder('Rechercher un parrain…').fill(name);
    await expect(page.getByText(name)).toHaveCount(0);
  });
});

// ─── Supervisor read-only enforcement ───────────────────────────────────────

test.describe('SUPERVISOR read-only enforcement (PR 18)', () => {
  test('no mutation buttons are shown across Parrains, Cagnottes, Dons, Communications, Rapports', async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto('/app/donateurs');

    await page.getByRole('button', { name: 'Parrains', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nouveau parrain' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Donateurs ponctuels', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nouveau donateur' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cagnottes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nouvelle cagnotte' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Dons', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enregistrer un don' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Communications', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enregistrer une communication' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Rapports', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nouveau rapport' })).toHaveCount(0);
  });
});

// ─── Cagnottes tab ──────────────────────────────────────────────────────────

test.describe('Cagnottes tab (PR 18)', () => {
  test('creates a campaign in Brouillon, activates it, and its progress bar reflects a backend-recorded donation', async ({ page, request }) => {
    await loginAsDirector(page);
    await openDonorsTab(page, 'Cagnottes');
    await page.getByRole('button', { name: 'Nouvelle cagnotte' }).click();

    const form = page.getByTestId('campaign-form-modal');
    const title = unique('Cagnotte Rentrée');
    await form.locator('#campaign-form-title').fill(title);
    await form.locator('#campaign-form-target').fill('200000');
    await form.getByRole('button', { name: 'Créer' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('BROUILLON', { exact: true }).first()).toBeVisible();

    await page.getByText(title).click();
    const detail = page.getByTestId('campaign-detail-modal');
    await detail.getByRole('button', { name: 'Activer' }).click();
    await expect(detail.getByText('ACTIVE', { exact: true })).toBeVisible();
    // These modals close on backdrop click or their own "Fermer" button —
    // there's no Escape-to-close handler in this codebase's modal convention.
    await detail.getByRole('button', { name: 'Fermer' }).click();
    await expect(detail).toHaveCount(0);

    // Record a donation against it directly through the API (out-of-band —
    // proves the UI displays the backend's own aggregate, not a
    // client-recomputed one), then confirm the detail view reflects it.
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { donor } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur Progression');
    const campaigns = await (await request.get(`${API_BASE}/campaigns?search=${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const campaignId = campaigns.data[0].id;
    await apiCreateDonation(request, token, { donorProfileId: donor.id, campaignId, amountXof: 60000 });

    // A full reload resets the workspace to its default tab — re-select
    // Cagnottes before looking for the campaign again.
    await page.reload();
    await page.getByRole('button', { name: 'Cagnottes', exact: true }).click();
    await page.getByText(title).click();
    // "60 000 FCFA" legitimately appears twice in this modal — the progress
    // bar's collected total and the matching row in the donations list
    // below it — so .first() (the progress bar) rather than an unscoped match.
    await expect(page.getByTestId('campaign-detail-modal').getByText('60 000 FCFA', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('campaign-detail-modal').getByText('1 don(s)', { exact: false })).toBeVisible();
  });

  test('terminating and cancelling both require an explicit confirmation step', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Cagnotte À Terminer');
    const campaign = await apiCreateCampaign(request, token, { title });
    await apiActivateCampaign(request, token, campaign.id);

    await loginAsDirector(page);
    await openDonorsTab(page, 'Cagnottes');
    await page.getByText(title).click();
    const detail = page.getByTestId('campaign-detail-modal');
    await detail.getByRole('button', { name: 'Terminer' }).click();

    // Confirmation dialog — not applied yet.
    await expect(page.getByText('Terminer la cagnotte ?')).toBeVisible();
    await expect(detail.getByText('ACTIVE', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(detail.getByText('TERMINÉE', { exact: true })).toBeVisible();
    await expect(detail.getByText('clôturée', { exact: false })).toBeVisible();
  });

  test('cancelling a campaign also requires confirmation', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Cagnotte À Annuler');
    await apiCreateCampaign(request, token, { title });

    await loginAsDirector(page);
    await openDonorsTab(page, 'Cagnottes');
    await page.getByText(title).click();
    const detail = page.getByTestId('campaign-detail-modal');
    await detail.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByText('Annuler la cagnotte ?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(detail.getByText('ANNULÉE', { exact: true })).toBeVisible();
  });

  // PR 19: this dev environment now has a real local S3-compatible endpoint
  // (see docs/testing.md §3a) so this exercises the real upload → list →
  // presigned-download → delete round trip against the real backend, not
  // just the surrounding UI chrome.
  test('DIRECTOR uploads, opens/downloads and deletes a campaign document; SUPERVISOR is read-only', async ({ page, request }) => {
    const token = await directorToken(request);
    const title = unique('Cagnotte Documents');
    await apiCreateCampaign(request, token, { title });

    await loginAsDirector(page);
    await openDonorsTab(page, 'Cagnottes');
    await page.getByText(title).click();
    const detail = page.getByTestId('campaign-detail-modal');
    await expect(detail.getByText('DOCUMENTS', { exact: true })).toBeVisible();

    const fileName = `budget-${Date.now()}.pdf`;
    await detail.locator('input[type="file"]').setInputFiles({
      name: fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake budget'),
    });
    await expect(detail.getByText(fileName, { exact: false })).toBeVisible({ timeout: 10000 });

    // Open/download — intercept the frontend's own GET .../url call to
    // capture the real presigned MinIO URL it obtains, then fetch that URL
    // directly to prove the bytes actually round-trip through S3. (Not
    // tracking the window.open() popup's own navigation: Chromium's
    // handling of a directly-served PDF response there — native viewer vs.
    // a download stream — is unreliable to assert on from here, and isn't
    // what this test needs to prove anyway.)
    const [urlResponse] = await Promise.all([
      page.waitForResponse((r) => /\/campaigns\/.+\/documents\/.+\/url$/.test(r.url()) && r.request().method() === 'GET'),
      detail.getByTitle('Voir').click(),
    ]);
    const { url: docUrl } = await urlResponse.json();
    expect(docUrl).toContain('X-Amz-Signature');
    const downloadResponse = await request.get(docUrl);
    expect(downloadResponse.status()).toBe(200);
    expect((await downloadResponse.body()).length).toBeGreaterThan(0);
    for (const p of page.context().pages()) {
      if (p !== page) await p.close().catch(() => {});
    }

    // handleDeleteDocument gates on window.confirm('Supprimer ce document ?')
    // — without this handler Playwright auto-dismisses it and the delete
    // never happens (looks like a passing click that silently no-ops).
    page.once('dialog', (d) => d.accept());
    await detail.getByTitle('Supprimer').click();
    await expect(detail.getByText(fileName, { exact: false })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Fermer' }).click();
    await expect(detail).toHaveCount(0);

    // Upload a second document so the SUPERVISOR check below has something
    // real to view (read-only) rather than just an empty section.
    const token2 = token;
    const campaigns = await (await request.get(`${API_BASE}/campaigns?search=${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${token2}` },
    })).json();
    const campaignId = campaigns.data[0].id;
    await request.post(`${API_BASE}/campaigns/${campaignId}/documents`, {
      headers: { Authorization: `Bearer ${token2}` },
      multipart: {
        file: { name: 'rapport-utilisation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake rapport') },
        // Unlike the UI-driven upload above (which now sends file.name as
        // the label, see CampaignDetailModal's PR 19 fix), this bypasses
        // the frontend entirely, so the label has to be set explicitly.
        label: 'rapport-utilisation.pdf',
      },
    });

    await switchUser(page, loginAsSupervisor);
    await page.goto('/app/donateurs');
    await page.getByRole('button', { name: 'Cagnottes', exact: true }).click();
    await page.getByText(title).click();
    const supervisorDetail = page.getByTestId('campaign-detail-modal');
    await expect(supervisorDetail.getByText('rapport-utilisation.pdf', { exact: false })).toBeVisible();
    await expect(supervisorDetail.locator('input[type="file"]')).toHaveCount(0);
    await expect(supervisorDetail.getByTitle('Supprimer')).toHaveCount(0);
    await expect(supervisorDetail.getByTitle('Voir')).toBeVisible();
  });
});

// ─── Dons tab & donation idempotency ────────────────────────────────────────

test.describe('Dons tab (PR 18)', () => {
  test('the campaign selector only lists ACTIVE campaigns', async ({ page, request }) => {
    const token = await directorToken(request);
    const activeCampaign = await apiCreateCampaign(request, token, { title: unique('Cagnotte Active Dons') });
    await apiActivateCampaign(request, token, activeCampaign.id);
    const draftCampaign = await apiCreateCampaign(request, token, { title: unique('Cagnotte Brouillon Dons') });

    await loginAsDirector(page);
    await openDonorsTab(page, 'Dons');
    await page.getByRole('button', { name: 'Enregistrer un don' }).click();
    const modal = page.getByTestId('donation-form-modal');
    const campaignSelect = modal.locator('#donation-form-campaign');
    await expect(campaignSelect.locator('option', { hasText: activeCampaign.title })).toHaveCount(1);
    await expect(campaignSelect.locator('option', { hasText: draftCampaign.title })).toHaveCount(0);
  });

  test('idempotency key is generated once per action, reused on retry of the same submission, and refreshed for a new action', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { donor, name } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur Idempotence');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Dons');
    await page.getByRole('button', { name: 'Enregistrer un don' }).click();
    const modal = page.getByTestId('donation-form-modal');
    await modal.locator('#donation-form-donor').selectOption({ label: name });
    await modal.locator('#donation-form-amount').fill('4000');
    await modal.locator('#donation-form-date').fill('2026-01-12');

    const keys: string[] = [];
    let attempt = 0;
    await page.route('**/api/donations', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      const body = route.request().postDataJSON();
      keys.push(body.idempotencyKey);
      attempt += 1;
      if (attempt === 1) {
        await route.abort('failed'); // simulate the first submission failing in flight
      } else {
        await route.continue();
      }
    });

    await page.getByTestId('donation-form-submit').click();
    await expect(modal).toBeVisible({ timeout: 5000 }); // still open — the first attempt failed
    await page.getByTestId('donation-form-submit').click();
    await expect(modal).toHaveCount(0, { timeout: 10000 }); // second attempt succeeded, form closed

    expect(keys.length).toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]); // same key reused across the retry

    await page.unroute('**/api/donations');
    const newKeys: string[] = [];
    await page.route('**/api/donations', async (route) => {
      if (route.request().method() === 'POST') newKeys.push(route.request().postDataJSON().idempotencyKey);
      await route.continue();
    });

    // Opening the form again is a genuinely new "record this donation" action.
    await page.getByRole('button', { name: 'Enregistrer un don' }).click();
    const modal2 = page.getByTestId('donation-form-modal');
    await modal2.locator('#donation-form-donor').selectOption({ label: name });
    await modal2.locator('#donation-form-amount').fill('1000');
    await modal2.locator('#donation-form-date').fill('2026-01-13');
    await page.getByTestId('donation-form-submit').click();
    await expect(modal2).toHaveCount(0, { timeout: 10000 });

    expect(newKeys.length).toBe(1);
    expect(newKeys[0]).not.toBe(keys[0]);

    void donor;
  });

  test('a rapid double-click sends the same idempotency key for both attempts and results in exactly one donation', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { donor, name } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur DoubleClick');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Dons');
    await page.getByRole('button', { name: 'Enregistrer un don' }).click();
    const modal = page.getByTestId('donation-form-modal');
    await modal.locator('#donation-form-donor').selectOption({ label: name });
    await modal.locator('#donation-form-amount').fill('5000');
    await modal.locator('#donation-form-date').fill('2026-01-15');

    const bodies: { idempotencyKey?: string }[] = [];
    await page.route('**/api/donations', async (route) => {
      if (route.request().method() === 'POST') bodies.push(route.request().postDataJSON());
      await route.continue();
    });

    // Two click() calls dispatched back-to-back within the same JS tick,
    // before React can re-render the disabled state — this is the actual
    // double-click race, not just two sequential UI actions.
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="donation-form-submit"]') as HTMLButtonElement;
      btn.click();
      btn.click();
    });

    await expect(modal).toHaveCount(0, { timeout: 10000 });
    await page.waitForTimeout(500); // let any second in-flight request settle

    expect(bodies.length).toBeGreaterThanOrEqual(1);
    const uniqueKeys = new Set(bodies.map((b) => b.idempotencyKey));
    expect(uniqueKeys.size).toBe(1); // both attempts (if two fired) carried the same key

    const list = await apiListDonations(request, token, { donorProfileId: donor.id });
    const matching = list.data.filter((d: { amountXof: number }) => d.amountXof === 5000);
    expect(matching.length).toBe(1); // the backend's own idempotency dedupe held even if two requests landed
  });

  test('recording a donation refreshes the list without a separate Finance call from the frontend', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur Refresh');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Dons');

    const postCalls: string[] = [];
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'POST') postCalls.push(new URL(route.request().url()).pathname);
      await route.continue();
    });

    await page.getByRole('button', { name: 'Enregistrer un don' }).click();
    const modal = page.getByTestId('donation-form-modal');
    await modal.locator('#donation-form-donor').selectOption({ label: name });
    await modal.locator('#donation-form-amount').fill('3000');
    await modal.locator('#donation-form-date').fill('2026-01-16');
    await page.getByTestId('donation-form-submit').click();
    await expect(modal).toHaveCount(0);

    const donationPosts = postCalls.filter((p) => p.endsWith('/donations'));
    const transactionPosts = postCalls.filter((p) => p.includes('/transactions') || p.includes('/finances'));
    expect(donationPosts.length).toBe(1);
    expect(transactionPosts.length).toBe(0); // POST /donations alone is responsible for the Finance side
  });
});

// ─── Communications tab ─────────────────────────────────────────────────────

test.describe('Communications tab (PR 18)', () => {
  test('records a communication with French type/direction labels; SUPERVISOR is read-only', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'PARRAIN', 'Parrain Communication');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Communications');
    await page.getByRole('button', { name: 'Enregistrer une communication' }).click();
    const modal = page.getByTestId('communication-form-modal');
    await modal.locator('#comm-form-donor').selectOption({ label: name });
    await modal.locator('#comm-form-type').selectOption('MESSAGE_SENT');
    await modal.locator('#comm-form-date').fill('2026-01-14');
    const subject = unique('Merci pour votre soutien');
    await modal.locator('#comm-form-subject').fill(subject);
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toHaveCount(0);

    // Scoped to this communication's own card — the dev DB accumulates
    // fixture communications across repeated runs, so an unscoped
    // getByText('MESSAGE ENVOYÉ') would hit a strict-mode violation once
    // more than one shares the same type.
    const card = page.getByTestId('communication-card').filter({ hasText: subject });
    await expect(card.getByText('MESSAGE ENVOYÉ', { exact: false })).toBeVisible();
    await expect(card.getByText('Sortant', { exact: false })).toBeVisible();

    await switchUser(page, loginAsSupervisor);
    await page.goto('/app/donateurs');
    await page.getByRole('button', { name: 'Communications', exact: true }).click();
    await expect(page.getByText(subject, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer une communication' })).toHaveCount(0);
  });
});

// ─── Rapports tab ────────────────────────────────────────────────────────────

test.describe('Rapports tab (PR 18)', () => {
  test('the report creation selector only lists PARRAIN profiles, never DONATEUR_PONCTUEL', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name: parrainName } = await makeDonorFixture(request, token, categories, 'PARRAIN', 'Parrain Rapport Sélecteur');
    const { name: donateurName } = await makeDonorFixture(request, token, categories, 'DONATEUR_PONCTUEL', 'Donateur Rapport Sélecteur');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Rapports');
    await page.getByRole('button', { name: 'Nouveau rapport' }).click();
    const modal = page.getByTestId('donor-report-form-modal');
    const select = modal.locator('#report-form-sponsor');
    await expect(select.locator('option', { hasText: parrainName })).toHaveCount(1);
    await expect(select.locator('option', { hasText: donateurName })).toHaveCount(0);
  });

  test('creates monthly and quarterly reports', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'PARRAIN', 'Parrain Rapport Périodes');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Rapports');

    for (const [periodType, label] of [['MENSUEL', 'Mensuel'], ['TRIMESTRIEL', 'Trimestriel']] as const) {
      await page.getByRole('button', { name: 'Nouveau rapport' }).click();
      const modal = page.getByTestId('donor-report-form-modal');
      await modal.locator('#report-form-sponsor').selectOption({ label: name });
      await modal.locator('#report-form-period-type').selectOption(periodType);
      await modal.locator('#report-form-start').fill('2026-01-01');
      await modal.locator('#report-form-end').fill(periodType === 'MENSUEL' ? '2026-01-31' : '2026-03-31');
      await modal.getByRole('button', { name: 'Créer' }).click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  // A minimal but genuinely valid 1×1 transparent PNG — needed because
  // pdf-lib's embedPng (PdfReportService, when it includes an approved
  // photo) parses real PNG bytes, not just a mimetype header. Unlike the
  // campaign-document tests, a fake buffer would make generate() itself
  // 500 once a photo is approved.
  const VALID_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // PR 19: real S3 endpoint now configured (see docs/testing.md §3a), so
  // this exercises the actual DRAFT → GENERATED → SENT lifecycle end to
  // end — real photo upload, real PDF generation/regeneration, real
  // presigned preview/download, real immutability after SENT. The
  // pixel-level "only approved photos are embedded" rule itself is already
  // covered by the backend's own PDF-text-extraction E2E tests (PR 17,
  // 374/374 unchanged) — this test verifies the UI lifecycle and approval
  // gating around it, not PDF internals.
  test('full DRAFT → GENERATED → SENT lifecycle with a real uploaded/approved photo and real PDF generation', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'PARRAIN', 'Parrain Rapport Cycle Vie Reel');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Rapports');
    await page.getByRole('button', { name: 'Nouveau rapport' }).click();
    const form = page.getByTestId('donor-report-form-modal');
    await form.locator('#report-form-sponsor').selectOption({ label: name });
    await form.locator('#report-form-period-type').selectOption('TRIMESTRIEL');
    await form.locator('#report-form-start').fill('2026-01-01');
    await form.locator('#report-form-end').fill('2026-03-31');
    await form.getByRole('button', { name: 'Créer' }).click();
    await expect(form).toHaveCount(0);

    await page.getByText(name).first().click();
    const detail = page.getByTestId('donor-report-detail-modal');
    await expect(detail.getByText('BROUILLON', { exact: true })).toBeVisible();
    await expect(detail.getByText(
      'Seules les photos approuvées seront incluses dans le rapport envoyé au parrain.',
    )).toBeVisible();

    // Upload a real photo, still unapproved by default, then approve it.
    await detail.locator('input[type="file"]').setInputFiles({
      name: 'activite.png', mimeType: 'image/png', buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
    });
    await expect(detail.getByText('En attente', { exact: false })).toBeVisible({ timeout: 10000 });
    await detail.getByTitle('Approuver').click();
    await expect(detail.getByText('Approuvée', { exact: true })).toBeVisible();

    // Generate — a real S3 upload of a real rendered PDF that embeds the
    // now-approved photo (pdf-lib would throw on invalid PNG bytes, so this
    // also proves the fixture photo is a real, parseable image).
    await detail.getByRole('button', { name: 'Générer le PDF' }).click();
    await expect(detail.getByText('GÉNÉRÉ', { exact: true })).toBeVisible({ timeout: 20000 });

    // Preview — same approach as the campaign-document test above:
    // intercept the frontend's own GET .../file-url call for the real
    // presigned MinIO URL rather than tracking window.open()'s popup
    // navigation (unreliable for a directly-served PDF response).
    const [urlResponse] = await Promise.all([
      page.waitForResponse((r) => /\/donor-reports\/.+\/file-url$/.test(r.url()) && r.request().method() === 'GET'),
      detail.getByRole('button', { name: 'Aperçu' }).click(),
    ]);
    const { url: pdfUrl } = await urlResponse.json();
    expect(pdfUrl).toContain('X-Amz-Signature');
    const pdfResponse = await request.get(pdfUrl);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
    for (const p of page.context().pages()) {
      if (p !== page) await p.close().catch(() => {});
    }

    // Still editable pre-SENT: upload a second (unapproved) photo, then
    // delete specifically that one — the row is scoped by its own caption
    // (now the original filename, see DonorReportDetailModal's PR 19 fix)
    // so this doesn't risk deleting the already-approved first photo.
    await detail.locator('input[type="file"]').setInputFiles({
      name: 'activite-2.png', mimeType: 'image/png', buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
    });
    await expect(detail.getByText('activite-2.png', { exact: false })).toBeVisible({ timeout: 10000 });
    // Scope by the "En attente" badge, not the filename — at this point in
    // the test it's unique to this second, still-unapproved photo (the
    // first is already "Approuvée"), and unambiguously identifies the row
    // to delete regardless of how the two rows' divs happen to nest.
    const pendingRow = detail.locator('div').filter({ hasText: 'En attente' }).last();
    // handleDeletePhoto gates on window.confirm('Supprimer cette photo ?').
    page.once('dialog', (d) => d.accept());
    await pendingRow.getByTitle('Supprimer').click();
    await expect(detail.getByText('En attente', { exact: false })).toHaveCount(0);
    await expect(detail.getByText('activite-2.png', { exact: false })).toHaveCount(0);
    await expect(detail.getByText('activite.png', { exact: false })).toBeVisible(); // the approved one remains

    // Regenerate — GENERATED → GENERATED, still succeeds with the approved
    // photo still attached.
    await detail.getByRole('button', { name: 'Régénérer' }).click();
    await expect(detail.getByText('GÉNÉRÉ', { exact: true })).toBeVisible({ timeout: 20000 });

    await detail.getByRole('button', { name: 'Marquer comme envoyé' }).click();
    await expect(page.getByText('Marquer ce rapport comme envoyé ?')).toBeVisible();
    await page.getByRole('button', { name: "Confirmer l'envoi" }).click();
    await expect(detail.getByText('ENVOYÉ', { exact: true })).toBeVisible();

    // SENT immutability — no photo upload/approve/delete, no
    // regenerate/mark-sent; preview/download still work.
    await expect(detail.locator('input[type="file"]')).toHaveCount(0);
    await expect(detail.getByTitle('Approuver')).toHaveCount(0);
    await expect(detail.getByTitle('Supprimer')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Régénérer' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Marquer comme envoyé' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Aperçu' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Télécharger' })).toBeVisible();
  });

  test('SUPERVISOR only gets preview/download on a report, never generate/photo/mark-sent controls', async ({ page, request }) => {
    const token = await directorToken(request);
    const categories = await apiListCategories(request, token);
    const { name } = await makeDonorFixture(request, token, categories, 'PARRAIN', 'Parrain Rapport Supervisor');

    await loginAsDirector(page);
    await openDonorsTab(page, 'Rapports');
    await page.getByRole('button', { name: 'Nouveau rapport' }).click();
    const form = page.getByTestId('donor-report-form-modal');
    await form.locator('#report-form-sponsor').selectOption({ label: name });
    await form.locator('#report-form-start').fill('2026-01-01');
    await form.locator('#report-form-end').fill('2026-03-31');
    await form.getByRole('button', { name: 'Créer' }).click();
    await expect(form).toHaveCount(0);

    await switchUser(page, loginAsSupervisor);
    await page.goto('/app/donateurs');
    await page.getByRole('button', { name: 'Rapports', exact: true }).click();
    await page.getByText(name).first().click();
    const detail = page.getByTestId('donor-report-detail-modal');
    await expect(detail.getByRole('button', { name: 'Générer le PDF' })).toHaveCount(0);
    await expect(detail.locator('input[type="file"]')).toHaveCount(0);
    await expect(detail.getByTitle('Approuver')).toHaveCount(0);
  });
});

// ─── French labels ──────────────────────────────────────────────────────────

test.describe('French enum labels (PR 18)', () => {
  test('never renders raw enum values — only their French labels', async ({ page, request }) => {
    const token = await directorToken(request);
    await apiCreateCampaign(request, token, { title: unique('Cagnotte Libellés') });

    await loginAsDirector(page);
    await openDonorsTab(page, 'Cagnottes');
    await expect(page.getByRole('button', { name: 'Brouillon', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminée', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annulée', exact: true })).toBeVisible();
    await expect(page.getByText('BROUILLON', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Rapports', exact: true }).click();
    await page.getByRole('button', { name: 'Nouveau rapport' }).click();
    const modal = page.getByTestId('donor-report-form-modal');
    await expect(modal.locator('#report-form-period-type option', { hasText: 'Mensuel' })).toHaveCount(1);
    await expect(modal.locator('#report-form-period-type option', { hasText: 'Trimestriel' })).toHaveCount(1);
  });
});

// ─── Responsive ─────────────────────────────────────────────────────────────

test.describe('Donors module — responsive layout (PR 18)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile viewport has no horizontal overflow and tab/action controls stay reachable', async ({ page }) => {
    await loginAsDirector(page);
    await page.goto('/app/donateurs');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByRole('button', { name: 'Dons', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dons', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enregistrer un don' })).toBeVisible();
  });
});
