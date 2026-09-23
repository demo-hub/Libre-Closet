import { test, expect } from '@playwright/test';

test('every auth field has a label', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.goto('/auth/register');
  for (const label of ['Email', 'Password', 'Confirm password']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('the first press on Register submits, even while the last field is being validated', async ({
  page,
}) => {
  await page.route('**/auth/register', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 204 })
      : route.continue(),
  );
  await page.goto('/auth/register');
  await page.locator('#email').click();
  await page.keyboard.type('press@example.com', { delay: 20 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('Password123!', { delay: 20 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('Password123!', { delay: 20 });
  const posted = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/auth/register'),
  );
  const button = await page
    .getByRole('button', { name: 'Register' })
    .boundingBox();
  await page.mouse.move(button!.x + 10, button!.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await posted;
});

test('a field error is tied to its field', async ({ page }) => {
  await page.goto('/auth/register');
  await page.locator('#email').fill('not-an-email');
  await page.locator('#email').press('Tab');
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#email')).toHaveAttribute(
    'aria-describedby',
    'email-error',
  );
  await expect(page.locator('#email-error')).toContainText('Error:');
});

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
