import { test, expect } from '@playwright/test';

const APP_NAME = process.env.APP_NAME || 'Boilerplate';

test('homepage loads with APP_NAME title and version', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/');
  await expect(page.locator('body')).toContainText(APP_NAME);
  expect(
    consoleErrors,
    `Console errors found:\n${consoleErrors.join('\n')}`,
  ).toHaveLength(0);
});

test('garment with several colors saves and lists them', async ({ page }) => {
  const email = `colors-${Date.now()}@example.com`;
  const password = 'Password123!';

  // Signs in a user; with AUTH_ENABLED=false the wardrobe guard passes requests through anyway.
  await page.request.post('/auth/register', {
    form: { email, password, confirmPassword: password },
  });

  // Two `color` fields, as the multiselect submits them; stored comma-joined.
  const response = await page.request.post('/wardrobe', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: 'name=Smoke+colors&category=tops&color=red&color=blue',
  });
  expect(response.ok()).toBeTruthy();
  const showPath = new URL(response.url()).pathname;
  expect(showPath).toMatch(/^\/wardrobe\/\d+$/);

  await page.goto(showPath);
  await expect(page.locator('body')).toContainText('red, blue');
});
