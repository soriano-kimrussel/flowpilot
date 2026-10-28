// Public pages and client-side validation. Runs without Supabase credentials.
import { expect, test } from '@playwright/test';

test('landing page explains the product and links to sign up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Automate lead intake');
  await page
    .getByRole('link', { name: /Create a free workspace/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/register$/);
});

test('features, pricing and privacy pages render', async ({ page }) => {
  for (const [path, heading] of [
    ['/features', 'Features'],
    ['/pricing', 'Pricing'],
    ['/privacy', 'Privacy'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }
});

test('login form validates input in the browser', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Enter your password')).toBeVisible();
});

test('registration form enforces password rules', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('Work email').fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('different');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 8 characters')).toBeVisible();
  await expect(page.getByText('Passwords do not match')).toBeVisible();
});
