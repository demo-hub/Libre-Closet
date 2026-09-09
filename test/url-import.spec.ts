import { expect, test } from '@playwright/test';
import { startShop, type ShopServer } from './fixtures/shop-server';

/**
 * Import from a link, against a shop served on 127.0.0.1. The app only fetches
 * it because playwright.config.ts sets IMPORT_ALLOW_PRIVATE_NETWORKS for the
 * test server; production refuses loopback outright.
 *
 * Background removal stays off throughout so the model is never downloaded.
 */
let shop: ShopServer;

test.beforeAll(async () => {
  shop = await startShop();
});

test.afterAll(async () => {
  await shop.close();
});

const openImportBox = async (page: import('@playwright/test').Page) => {
  await page.goto('/wardrobe/new');
  await page.locator('#bgRemovalToggle').uncheck();
  await page.locator('#importForm summary').click();
  await expect(page.locator('#importUrl')).toBeVisible();
};

test('a pasted product link fills the form in', async ({ page }) => {
  await openImportBox(page);
  await page.locator('#importUrl').fill(`${shop.origin}/p/wool-coat`);
  await page.locator('#importBtn').click();

  await expect(page.locator('.alert-success')).toContainText('127.0.0.1');
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Wool Blend Coat',
  );
  await expect(page.locator('input[name="brand"]')).toHaveValue('Northwind');
  await expect(page.locator('input[name="category"]')).toHaveValue('outerwear');
  await expect(page.locator('input[name="size"]')).toHaveValue('M');
  await expect(page.locator('textarea[name="notes"]')).toContainText(
    'A midweight coat',
  );
  await expect(page.locator('input[name="sourceUrl"]')).toHaveValue(
    `${shop.origin}/p/wool-coat`,
  );

  // The colour the page stated, checked and rendered as a pill.
  await expect(
    page.locator('input[name="color"][value="beige"]'),
  ).toBeChecked();
  await expect(page.locator('#color-pills-')).toContainText('beige');

  // Every prefilled field says so, and stops saying so once edited.
  await expect(page.locator('[data-suggested="name"]')).toBeVisible();
  await page.locator('input[name="name"]').fill('My coat');
  await expect(page.locator('[data-suggested="name"]')).toHaveCount(0);

  // The photo arrives inline and the page turns it into the file Save posts,
  // so by now the preview is showing that file rather than the data: URI.
  await expect(page.locator('#photoPreview')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('#photoInput').evaluate((el) => el.files?.length ?? 0),
    )
    .toBe(1);
});

test('the shop is asked the way a browser would ask', async ({ page }) => {
  await openImportBox(page);
  await page.locator('#importUrl').fill(`${shop.origin}/p/moved`);
  await page.locator('#importBtn').click();
  await expect(page.locator('.alert-success')).toBeVisible();

  // The redirect was followed, and the photo was asked for with the page as
  // its referer, which is what shop CDNs gate on.
  const paths = shop.requests.map((r) => r.path);
  expect(paths).toContain('/p/moved');
  expect(paths).toContain('/p/wool-coat');
  const image = shop.requests.find((r) => r.path === '/coat-1.jpg');
  expect(image?.headers.referer).toBe(`${shop.origin}/p/wool-coat`);
  const page_ = shop.requests.find((r) => r.path === '/p/wool-coat');
  expect(page_?.headers['user-agent']).toContain('Mozilla/5.0');
  expect(page_?.headers['accept-language']).toContain('en');
});

test('the imported photo is saved with the garment', async ({ page }) => {
  await openImportBox(page);
  await page.locator('#importUrl').fill(`${shop.origin}/p/wool-coat`);
  await page.locator('#importBtn').click();
  await expect(page.locator('#photoPreview')).toBeVisible();

  await page.locator('#saveBtn').click();
  await expect(page).toHaveURL(/\/wardrobe\/\d+/);
  await expect(page.locator('main img[src^="/file/"]')).toBeVisible();
  // The link the garment came from is kept, and points back at the shop.
  await expect(
    page.locator(`main a[href="${shop.origin}/p/wool-coat"]`),
  ).toBeVisible();
});

test('another image from the page can be chosen without losing edits', async ({
  page,
}) => {
  await openImportBox(page);
  await page.locator('#importUrl').fill(`${shop.origin}/p/wool-coat`);
  await page.locator('#importBtn').click();
  await expect(page.locator('#photoPreview')).toBeVisible();
  // The page offers its second image; the first is the one on screen.
  await expect(page.locator('.btn-outline')).toHaveText(/Image 2/);

  await page.locator('input[name="name"]').fill('Edited by hand');
  await page.locator('.btn-outline').click();

  // Now the second is shown and the first is what is offered back.
  await expect(page.locator('.btn-outline')).toHaveText(/Image 1/);
  await expect(page.locator('#photoPreview')).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Edited by hand',
  );
});

test.describe('when the import cannot be completed', () => {
  test('a link the policy refuses is reported, not fetched', async ({
    page,
  }) => {
    await openImportBox(page);
    // A private address is allowed here by the test flag, so the refusal under
    // test is the scheme one, which no flag lifts.
    await page.locator('#importUrl').fill('ftp://example.com/p/1');
    await page.locator('#importBtn').click();
    await expect(page.locator('.alert-warning')).toBeVisible();
  });

  test('a shop that turns us away keeps the link for the user', async ({
    page,
  }) => {
    await openImportBox(page);
    await page.locator('#importUrl').fill(`${shop.origin}/p/refused`);
    await page.locator('#importBtn').click();
    await expect(page.locator('.alert-warning')).toBeVisible();
    await expect(page.locator('#photoPreview')).toBeHidden();
  });

  test('a challenge page is recognised for what it is', async ({ page }) => {
    await openImportBox(page);
    await page.locator('#importUrl').fill(`${shop.origin}/p/blocked`);
    await page.locator('#importBtn').click();
    await expect(page.locator('.alert-warning')).toBeVisible();
    // Nothing off the wall becomes a garment name.
    await expect(page.locator('input[name="name"]')).toHaveValue('');
    await expect(page.locator('input[name="sourceUrl"]')).toHaveValue(
      `${shop.origin}/p/blocked`,
    );
  });
});
