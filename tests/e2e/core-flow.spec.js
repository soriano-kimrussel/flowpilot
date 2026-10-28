// End-to-end core flow against a configured Supabase TEST project.
// Requires the app running with real Supabase env vars, plus either:
//   E2E_EMAIL + E2E_PASSWORD of a confirmed test user, or
//   E2E_REGISTER=1 when "Confirm email" is disabled in the test project's Auth settings.
import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? `e2e-${Date.now()}@example.com`;
const password = process.env.E2E_PASSWORD ?? 'E2e-password-123';
const canRun = Boolean(
  (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) || process.env.E2E_REGISTER,
);

test.describe.configure({ mode: 'serial' });
test.skip(
  !canRun,
  'Set E2E_EMAIL/E2E_PASSWORD (or E2E_REGISTER=1) and run against a Supabase test project',
);

test('register or log in, build a workflow, run it and inspect persisted results', async ({
  page,
}) => {
  test.setTimeout(120_000);

  if (process.env.E2E_REGISTER && !process.env.E2E_EMAIL) {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('E2E Tester');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  } else {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  // Create a lead (manual).
  const leadEmail = `jordan-${Date.now()}@acme-robotics.example`;
  await page.goto('/dashboard/leads/new');
  await page.getByLabel('Name', { exact: true }).fill('Jordan Blake');
  await page.getByLabel('Email', { exact: true }).fill(leadEmail);
  await page.getByLabel('Company').fill('Acme Robotics');
  await page.getByLabel('Job title').fill('Head of Operations');
  await page.getByLabel('Company size (employees)').fill('120');
  await page.getByLabel('Budget (USD)').fill('15000');
  await page
    .getByLabel('Inquiry message')
    .fill('We need pricing and a demo next week for our sales team.');
  await page.getByRole('button', { name: 'Create lead' }).click();
  await expect(page.getByRole('heading', { name: /Jordan Blake/ })).toBeVisible();
  const leadUrl = page.url();

  // Create a workflow from the qualification template.
  await page.goto('/dashboard/workflows/new');
  await page.getByLabel('Start from').selectOption({ label: 'Lead qualification pipeline' });
  const workflowName = `E2E pipeline ${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill(workflowName);
  await page.getByRole('button', { name: /Create & open editor/ }).click();
  await expect(page.getByRole('heading', { name: workflowName })).toBeVisible();

  // Run it manually for the lead from the lead page.
  await page.goto(leadUrl);
  await page.getByLabel('Workflow to run').selectOption({ label: `${workflowName} (draft)` });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/executions\//, { timeout: 60_000 });
  await expect(page.getByText('Succeeded').first()).toBeVisible();
  await expect(page.getByText('Score lead')).toBeVisible();
  await expect(page.getByText('Draft follow-up')).toBeVisible();

  // Results persist across a reload.
  await page.reload();
  await expect(page.getByText('Score lead')).toBeVisible();
  await expect(page.getByText('Replayed (idempotent)')).toHaveCount(0);

  // The lead now has a score and a simulated email in its activity.
  await page.goto(leadUrl);
  await expect(page.getByText('Score explanation')).toBeVisible();
  await expect(page.getByText(/Simulated email/)).toBeVisible();

  // Log out.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
