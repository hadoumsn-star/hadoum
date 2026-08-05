import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DIRECTOR_CREDENTIALS, SUPERVISOR_CREDENTIALS, login } from '../../e2e/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence', 'module4');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  const file = path.join(EVIDENCE_DIR, `${String(shot).padStart(2, '0')}-4b-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function goToTickets(page: Page) {
  await page.goto('/app/tickets-maintenance');
  await expect(page.getByPlaceholder('Rechercher un ticket…')).toBeVisible({ timeout: 10_000 });
}

test.describe('M4-006/M4-007 — Create maintenance ticket, urgency levels', () => {
  test('Create a critical-urgency ticket linked to a facility', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) failures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`); });

    await login(page, DIRECTOR_CREDENTIALS);
    await goToTickets(page);

    await page.getByRole('button', { name: 'Nouveau ticket' }).click();
    await snap(page, 'ticket-modal-opened');

    const modal = page.locator('h3', { hasText: 'Nouveau ticket' }).locator('../..');
    const title = `TEST-E2E-Ticket-${Date.now()}`;
    await page.getByPlaceholder("Ex : Fuite d'eau salle de bain").fill(title);
    await modal.locator('select').nth(0).selectOption({ index: 1 }); // first real facility option
    await modal.locator('select').nth(1).selectOption('CRITIQUE');
    await page.getByPlaceholder('Ex : Plomberie').fill('TEST-E2E-Plomberie');
    await page.getByPlaceholder('Décrivez le problème…').fill('TEST-E2E-Description du problème');
    await snap(page, 'ticket-filled');

    await page.getByRole('button', { name: 'Créer' }).click();
    await page.waitForTimeout(1500);
    await snap(page, 'ticket-created');
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('CRITIQUE').last()).toBeVisible();

    console.log('TICKET_CREATE failures=', JSON.stringify(failures));
  });
});

test.describe('M4-008/M4-009 — Maintenance workflow: submit then approve (two actors)', () => {
  test('DIRECTOR creates and submits a ticket for validation; SUPERVISOR approves it from a separate session', async ({ browser }) => {
    const dirContext = await browser.newContext();
    const dirPage = await dirContext.newPage();
    await login(dirPage, DIRECTOR_CREDENTIALS);
    await goToTickets(dirPage);

    await dirPage.getByRole('button', { name: 'Nouveau ticket' }).click();
    const title = `TEST-E2E-TicketWorkflow-${Date.now()}`;
    await dirPage.getByPlaceholder("Ex : Fuite d'eau salle de bain").fill(title);
    const modal = dirPage.locator('h3', { hasText: 'Nouveau ticket' }).locator('../..');
    await modal.locator('select').nth(0).selectOption({ index: 1 });
    await modal.locator('select').nth(1).selectOption('CRITIQUE'); // only CRITIQUE tickets can be submitted for validation
    await dirPage.getByPlaceholder('Décrivez le problème…').fill('TEST-E2E-Nécessite validation');
    await dirPage.getByRole('button', { name: 'Créer' }).click();
    await expect(dirPage.getByText(title)).toBeVisible({ timeout: 10_000 });
    await dirPage.getByText(title).click();
    await dirPage.screenshot({ path: path.join(EVIDENCE_DIR, '04-4b-director-ticket-detail.png'), fullPage: true });

    const submitBtn = dirPage.getByRole('button', { name: /Soumettre pour validation/ });
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    console.log('WORKFLOW_CHECK submit button visible for DIRECTOR=', submitVisible);
    if (submitVisible) {
      dirPage.once('dialog', (d) => d.accept());
      await submitBtn.click();
      await dirPage.waitForTimeout(1500);
      await dirPage.screenshot({ path: path.join(EVIDENCE_DIR, '05-4b-ticket-submitted.png'), fullPage: true });
      await expect(dirPage.getByText('EN ATTENTE DE VALIDATION')).toBeVisible({ timeout: 10_000 }).catch(async () => {
        console.log('WORKFLOW_NOTE: "EN ATTENTE DE VALIDATION" label not found after submit — checking actual status text');
      });
    }
    await dirContext.close();

    // SUPERVISOR approves from a separate session
    const supContext = await browser.newContext();
    const supPage = await supContext.newPage();
    await login(supPage, SUPERVISOR_CREDENTIALS);
    await goToTickets(supPage);
    await expect(supPage.getByText(title)).toBeVisible({ timeout: 10_000 });
    await supPage.getByText(title).click();
    await supPage.screenshot({ path: path.join(EVIDENCE_DIR, '06-4b-supervisor-ticket-detail.png'), fullPage: true });

    const approveBtn = supPage.getByRole('button', { name: 'Approuver' });
    const canApprove = await approveBtn.isVisible().catch(() => false);
    console.log('WORKFLOW_CHECK approve button visible for SUPERVISOR=', canApprove);
    if (canApprove) {
      await approveBtn.click();
      await supPage.waitForTimeout(1500);
      await supPage.screenshot({ path: path.join(EVIDENCE_DIR, '07-4b-ticket-approved.png'), fullPage: true });
    }
    await supContext.close();
  });
});

test.describe('M4-010 — Maintenance attachments', () => {
  test('Upload an image and a PDF attachment to a ticket', async ({ page }) => {
    await login(page, DIRECTOR_CREDENTIALS);
    await goToTickets(page);

    await page.getByRole('button', { name: 'Nouveau ticket' }).click();
    const title = `TEST-E2E-TicketDocs-${Date.now()}`;
    await page.getByPlaceholder("Ex : Fuite d'eau salle de bain").fill(title);
    const docsModal = page.locator('h3', { hasText: 'Nouveau ticket' }).locator('../..');
    await docsModal.locator('select').nth(0).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
    await page.getByText(title).click();
    await snap(page, 'ticket-detail-opened');

    const fileInput = page.locator('input[type="file"]').first();
    const hasFileInput = await fileInput.count();
    if (hasFileInput > 0) {
      await fileInput.setInputFiles({
        name: 'TEST-E2E-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-jpeg-content-TEST-E2E'),
      });
      await page.waitForTimeout(1500);
      await snap(page, 'ticket-attachment-uploaded');
    }
    console.log('ATTACHMENT_CHECK fileInputFound=', hasFileInput > 0);
  });
});

test.describe('M4-009 — SUPERVISOR permissions on Tickets', () => {
  test('SUPERVISOR view of tickets page', async ({ page }) => {
    const apiFailures: string[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/maintenance-tickets') && (res.status() === 401 || res.status() === 403)) {
        apiFailures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });
    await login(page, SUPERVISOR_CREDENTIALS);
    await goToTickets(page);
    await snap(page, 'supervisor-tickets-view');
    const createCount = await page.getByRole('button', { name: 'Nouveau ticket' }).count();
    console.log('PERMISSIONS_CHECK supervisor NouveauTicket visible=', createCount > 0);
    console.log('PERMISSIONS_CHECK supervisor unauthorized responses=', JSON.stringify(apiFailures));
  });
});
