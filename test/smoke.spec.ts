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
  await expect(
    page.getByRole('banner').getByRole('link', { name: APP_NAME, exact: true }),
  ).toBeVisible();
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

test('brand fonts are self-hosted, cached for good, and actually used', async ({
  page,
}) => {
  const font = await page.request.get('/assets/fonts/inter-v20-latin.woff2');
  expect(font.ok()).toBeTruthy();
  expect(font.headers()['content-type']).toBe('font/woff2');
  // The file names carry the upstream version, so they never change in place.
  expect(font.headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  );

  // bundle.css is not content-hashed, so it must keep revalidating.
  const css = await page.request.get('/bundle.css');
  expect(css.headers()['cache-control']).toBe('public, max-age=0');

  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replace(/"/g, '')),
  );
  expect(loaded).toEqual(
    expect.arrayContaining(['Inter', 'Plus Jakarta Sans']),
  );
});
