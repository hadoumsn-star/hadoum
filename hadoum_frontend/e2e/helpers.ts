import { Page, expect } from '@playwright/test';

// Real test accounts on the dev database (see docs/testing.md for how to
// override via env vars in CI with a seeded account instead).
export const DIRECTOR_CREDENTIALS = {
  email: process.env.E2E_DIRECTOR_EMAIL ?? 'hadoum@gmail.com',
  password: process.env.E2E_DIRECTOR_PASSWORD ?? 'hadoumsn2026',
};
export const SUPERVISOR_CREDENTIALS = {
  email: process.env.E2E_SUPERVISOR_EMAIL ?? 'dounde.diallo@gmail.com',
  password: process.env.E2E_SUPERVISOR_PASSWORD ?? 'test123',
};

export async function login(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto('/login');
  await page.getByPlaceholder('prenom.nom@hadoum.org').fill(credentials.email);
  await page.getByPlaceholder('••••••••').fill(credentials.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
}

export async function loginAsDirector(page: Page) {
  await login(page, DIRECTOR_CREDENTIALS);
}

export async function loginAsSupervisor(page: Page) {
  await login(page, SUPERVISOR_CREDENTIALS);
}
