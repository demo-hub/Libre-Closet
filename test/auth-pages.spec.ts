import { test, expect } from '@playwright/test';

test('every auth field has a label', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
});

for (const [path, title] of [
  ['/auth/login', 'Log in'],
  ['/auth/reset', 'Reset password'],
  ['/auth/reset-code?email=a%40example.com', 'Change password'],
]) {
  test(`${path} is titled after its heading`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  });
}

test('a failed login says so and keeps the email', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'chromium',
    'login allows five attempts a minute',
  );
  await page.goto('/auth/login');
  await page.locator('#email').fill('nobody@example.com');
  await page.locator('#password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'the email or password is incorrect',
  );
  await expect(page.locator('#email')).toHaveValue('nobody@example.com');
});

test.describe('the error page', () => {
  test('explains a missing page and dates it', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Error 404');
    await expect(page.locator('main')).toContainText('Page not found.');
    await expect(page.locator('main time[datetime]')).toHaveCount(1);
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });
    test('explains it in German', async ({ page }) => {
      await page.goto('/no-such-page');
      await expect(page.locator('main')).toContainText('Seite nicht gefunden.');
    });
  });
});

test('the offline page holds still and keeps its hidden notice', async ({
  page,
}) => {
  await page.goto('/offline.html');
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
  await expect(page.locator('#pendingShare')).toBeHidden();
  await expect(page.locator('#pendingShare #pendingShareLink')).toHaveCount(1);
});

test('an unknown invite is reported as an error', async ({ page }) => {
  await page.goto('/wardrobe-share/invite/no-such-token');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
});

for (const path of [
  '/auth/reset',
  '/auth/reset-code',
  '/offline.html',
  '/wardrobe-share/invite/no-such-token',
  `/${'x'.repeat(80)}`,
]) {
  test(`${path.slice(0, 40)} does not scroll sideways at 320 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });
}

test('a rate-limited submit says to wait, not that the request failed', async ({
  page,
}) => {
  await page.route('**/auth/login', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 429, body: '' })
      : route.continue(),
  );
  await page.goto('/auth/login');
  await page.locator('#email').fill('someone@example.com');
  await page.locator('#password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#rateLimitedToast')).toBeVisible();
  await expect(page.locator('#rateLimitedToast')).toContainText(
    'Too many requests',
  );
  await expect(page.locator('#requestErrorToast')).toBeHidden();
});
