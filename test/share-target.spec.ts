import { expect, test, type Page } from '@playwright/test';
import { startShop, type ShopServer } from './fixtures/shop-server';

/**
 * The share target, driven the way the OS drives it: a top-level navigation
 * POST to /wardrobe/import/share carrying whatever the sharing app sent.
 *
 * A real share sheet needs an installed PWA, and PWA_ENABLED is false here (no
 * service worker registers), so the POST is made from a form on the page. That
 * is the same request the OS makes — the service worker never sees a POST
 * either way, because every route it registers is GET-only.
 */
let shop: ShopServer;

test.beforeAll(async () => {
  shop = await startShop();
});

test.afterAll(async () => {
  await shop.close();
});

/**
 * Posts a share payload as a navigation, the way the OS does — multipart, which
 * is the only encoding a share target uses.
 */
const shareText = async (page: Page, fields: Record<string, string>) => {
  await page.goto('/wardrobe/new');
  await page.locator('#bgRemovalToggle').uncheck();
  await page.evaluate((payload) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/wardrobe/import/share';
    form.enctype = 'multipart/form-data';
    for (const [name, value] of Object.entries(payload)) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }, fields);
  await page.waitForURL('**/wardrobe/import/share');
};

test('a shared link is imported into the form', async ({ page }) => {
  await shareText(page, {
    title: 'Shared from some app',
    text: `Look at this ${shop.origin}/p/wool-coat`,
    url: '',
  });

  await expect(page.locator('.alert-success')).toContainText('127.0.0.1');
  // The shop's own name, not the title the sharing app guessed at.
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Wool Blend Coat',
  );
  await expect(page.locator('[data-suggested="name"]')).toBeVisible();
  await expect(page.locator('input[name="brand"]')).toHaveValue('Northwind');
  await expect(page.locator('input[name="sourceUrl"]')).toHaveValue(
    `${shop.origin}/p/wool-coat`,
  );
  await expect(page.locator('#photoPreview')).toBeVisible();
});

test('a share with no link still opens a form worth filling in', async ({
  page,
}) => {
  await shareText(page, { title: 'Navy Wool Coat', text: 'from the shop' });

  await expect(page.locator('input[name="name"]')).toHaveValue(
    'Navy Wool Coat',
  );
  await expect(page.locator('[data-suggested="name"]')).toBeVisible();
  // The import box is open, because pasting a link is what to do next.
  await expect(page.locator('#importUrl')).toBeVisible();
});

test('a shared photo becomes the garment photo', async ({ page }) => {
  await page.goto('/wardrobe/new');
  await page.locator('#bgRemovalToggle').uncheck();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1b3a8f';
    context.fillRect(0, 0, 200, 200);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/wardrobe/import/share';
    form.enctype = 'multipart/form-data';
    const title = document.createElement('input');
    title.name = 'title';
    title.value = 'A photo I took';
    const file = document.createElement('input');
    file.type = 'file';
    file.name = 'photo';
    const data = new DataTransfer();
    data.items.add(new File([blob], 'coat.png', { type: 'image/png' }));
    file.files = data.files;
    form.append(title, file);
    document.body.appendChild(form);
    form.submit();
  });
  await page.waitForURL('**/wardrobe/import/share');

  await expect(page.locator('#photoPreview')).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue(
    'A photo I took',
  );
  // It is a real photo, carried into the file the Save button posts.
  await expect
    .poll(() =>
      page.locator('#photoInput').evaluate((el) => el.files?.length ?? 0),
    )
    .toBe(1);
});

test('a shared garment saves like any other', async ({ page }) => {
  await shareText(page, { url: `${shop.origin}/p/wool-coat` });
  await expect(page.locator('#photoPreview')).toBeVisible();

  await page.locator('#saveBtn').click();
  await expect(page).toHaveURL(/\/wardrobe\/\d+/);
  await expect(page.locator('main img[src^="/file/"]')).toBeVisible();
});

test('a share the shop refuses still keeps the link', async ({ page }) => {
  await shareText(page, { url: `${shop.origin}/p/refused` });

  await expect(page.locator('.alert-warning')).toBeVisible();
  await expect(page.locator('input[name="sourceUrl"]')).toHaveValue(
    `${shop.origin}/p/refused`,
  );
});
