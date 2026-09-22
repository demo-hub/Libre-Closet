import { test, expect } from '@playwright/test';

test('the first Tab reaches the skip link', async ({ page }) => {
  await page.goto('/wardrobe');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toBeInViewport();
});

test('the skip link moves focus to the page content', async ({ page }) => {
  await page.goto('/wardrobe');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('the section being viewed is marked in the one navigation shown', async ({
  page,
  isMobile,
}) => {
  await page.goto('/wardrobe/new');
  const nav = page.getByRole('navigation');
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole('link', { name: /wardrobe/i })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: /outfits/i })).not.toHaveAttribute(
    'aria-current',
  );
  await expect(page.locator('nav.dock')).toBeVisible({ visible: !!isMobile });
});

test('the header stays at the top while the page scrolls', async ({ page }) => {
  await page.goto('/privacy');
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const box = await page.getByRole('banner').boundingBox();
  expect(box?.y).toBe(0);
});

for (const path of ['/auth/login', '/auth/register']) {
  test(`${path} does not scroll sideways at 320 px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(320);
  });
}

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
