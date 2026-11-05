import { test, expect } from '@playwright/test';
import { onAccountsServer } from './fixtures/accounts';

test.use(onAccountsServer);

test('the sitemap lists the page', async ({ request }) => {
  expect(await (await request.get('/sitemap.xml')).text()).toContain(
    '/auth/register',
  );
});

test('every field has a label', async ({ page }) => {
  await page.goto('/auth/register');
  for (const label of ['Email', 'Password', 'Confirm password']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('the page is titled after its heading', async ({ page }) => {
  await page.goto('/auth/register');
  await expect(page).toHaveTitle('Register');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Register');
});

test('it does not scroll sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/auth/register');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
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

test('leaving the email field does not list the password rules', async ({
  page,
}) => {
  await page.goto('/auth/register');
  const validated = page.waitForResponse('**/auth/validate/register');
  await page.locator('#email').fill('someone@example.com');
  await page.locator('#email').press('Tab');
  await validated;
  await expect(page.locator('#password')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('#password-error')).toHaveCount(0);
  await expect(page.locator('#confirmPassword-error')).toHaveCount(0);
});

test('live validation never sends a typed password back', async ({ page }) => {
  await page.goto('/auth/register');
  // One validation at a time: a swap that lands mid-fill would eat the change.
  await page.locator('#email').fill('someone@example.com');
  const emailSettled = page.evaluate(
    () =>
      new Promise((resolve) =>
        document.addEventListener('htmx:afterSettle', resolve, { once: true }),
      ),
  );
  await page.locator('#email').press('Tab');
  await emailSettled;
  await page.locator('#password').fill('Typed-Secret-123');
  const validated = page.waitForResponse('**/auth/validate/register');
  await page.locator('#password').press('Tab');
  expect(await (await validated).text()).not.toContain('Typed-Secret-123');
  await expect(page.locator('#password')).toHaveValue('Typed-Secret-123');
});

test('live validation keeps what was typed while it was in flight', async ({
  page,
}) => {
  await page.route('**/auth/validate/register', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto('/auth/register');
  await page.locator('#email').fill('someone@example.com');
  await page.locator('#email').press('Tab');
  const response = page.waitForResponse('**/auth/validate/register');
  await page.keyboard.type('Password123!', { delay: 20 });
  await response;
  await expect(page.locator('#password')).toHaveValue('Password123!');
  await expect(page.locator('#password')).toBeFocused();
});

test('a field typed while a validation was in flight is validated when left', async ({
  page,
}) => {
  await page.route('**/auth/validate/register', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto('/auth/register');
  await page.locator('#email').fill('someone@example.com');
  await page.locator('#email').press('Tab');
  const settled = page.evaluate(
    () =>
      new Promise((resolve) =>
        document.addEventListener('htmx:afterSettle', resolve, { once: true }),
      ),
  );
  await page.keyboard.type('short', { delay: 20 });
  await settled;
  await expect(page.locator('#password')).toHaveValue('short');

  const second = page.waitForResponse('**/auth/validate/register');
  await page.keyboard.press('Tab');
  await second;
  await expect(page.locator('#password')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});
