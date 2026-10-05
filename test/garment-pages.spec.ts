import { readFileSync } from 'fs';
import { join } from 'path';
import { test, expect, type APIRequestContext } from '@playwright/test';

const coat = readFileSync(
  join(__dirname, '../scripts/screenshots/fixtures/camel-coat.png'),
);

async function createGarment(
  request: APIRequestContext,
  fields: Record<string, string>,
): Promise<string> {
  const response = await request.post('/wardrobe', {
    form: { category: 'outerwear', ...fields },
  });
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

async function createGarmentWithPhoto(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const show = await createGarment(request, { name });
  // Not through /wardrobe/import: its 30 requests a minute are shared by every spec and project.
  const response = await request.post(`${show}/photo`, {
    multipart: {
      photo: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
      nobgPhoto: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
    },
  });
  expect(response.ok()).toBeTruthy();
  return show;
}

const fitsItsColumn = (
  page: import('@playwright/test').Page,
  selector: string,
) =>
  page.evaluate((selector) => {
    const main = document.querySelector('main')!;
    const right =
      main.getBoundingClientRect().right -
      parseFloat(getComputedStyle(main).paddingRight);
    return (
      document.querySelector(selector)!.getBoundingClientRect().right <=
      right + 0.5
    );
  }, selector);

test.describe('the garment page', () => {
  test('is titled with the garment name', async ({ page }, info) => {
    const name = `Titled ${info.project.name}`;
    await page.goto(await createGarment(page.request, { name }));
    await expect(page).toHaveTitle(name);
  });

  test('names its back link and says what Delete deletes', async ({
    page,
  }, info) => {
    await page.goto(
      await createGarment(page.request, { name: `Named ${info.project.name}` }),
    );
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete garment' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete', exact: true }),
    ).toHaveCount(0);
  });

  test('writes the date for people and keeps it for machines', async ({
    page,
  }, info) => {
    await page.goto(
      await createGarment(page.request, {
        name: `Dated ${info.project.name}`,
        dateAquired: '2026-03-14',
      }),
    );
    const date = page.locator('main time');
    await expect(date).toHaveText('14 March 2026');
    await expect(date).toHaveAttribute('datetime', '2026-03-14');
  });

  test('says the link was copied, in the button and in a toast', async ({
    page,
  }, info) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            (window as unknown as { copied: string }).copied = text;
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto(
      await createGarment(page.request, {
        name: `Shared ${info.project.name}`,
      }),
    );
    const share = page.locator('main button[data-copy]');
    await share.click();
    await expect(share).toHaveText('Copied');
    await expect(page.locator('#copied-toast')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toMatch(/\/share\?shareableId=.+&type=garment$/);
    await expect(share).toHaveText('Share');
  });

  test('leaves neither "Copied" nor its toast in a page restored by Back', async ({
    page,
  }, info) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
      });
    });
    await page.goto(
      await createGarment(page.request, { name: `Back ${info.project.name}` }),
    );
    await page.locator('main button[data-copy]').click();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/edit/);
    await page.goBack();
    await expect(page.locator('main button[data-copy]')).toHaveText('Share');
    await expect(page.locator('#copied-toast')).toBeHidden();
  });

  test('offers the mask editor by name to someone who can edit', async ({
    page,
  }, info) => {
    await page.goto(
      await createGarmentWithPhoto(page.request, `Photo ${info.project.name}`),
    );
    await expect(
      page.getByRole('button', { name: 'Clean up background' }),
    ).toBeVisible();
  });

  test('does not scroll sideways at 320 px with a long name', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(
      await createGarment(page.request, {
        name: 'Supercalifragilisticexpialidociousovercoatwithaverylongname',
        brand: 'Averyveryverylongbrandnamewithnobreaks',
        notes: 'Notes'.repeat(40),
        sourceUrl: `https://shop.example/${'p'.repeat(120)}`,
      }),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });

  test.describe('in French', () => {
    test.use({ locale: 'fr-FR' });

    test('keeps the photo row on screen at 320 px', async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        await createGarmentWithPhoto(
          page.request,
          `Photo fr ${info.project.name}`,
        ),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });
  });
});

test.describe('the garment form', () => {
  test('is titled for what it does', async ({ page }) => {
    await page.goto('/wardrobe/new');
    await expect(page).toHaveTitle('New garment');
  });

  test('labels every field', async ({ page }) => {
    await page.goto('/wardrobe/new');
    for (const name of [
      'Name',
      'Brand',
      'Size',
      'Washing details',
      'Date acquired',
      'Notes',
      'Source link',
    ]) {
      await expect(
        page.getByRole('textbox', { name, exact: true }),
      ).toBeVisible();
    }
    // The visible "(required)" is hidden from the name; the required attribute says it.
    await expect(
      page.getByRole('combobox', { name: 'Category', exact: true }),
    ).toHaveAttribute('required', '');
    await expect(page.locator('label[for="garment-category"]')).toContainText(
      '(required)',
    );
  });

  test('moves focus to the message when an import cannot start', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    await page.locator('#importForm summary').click();
    await page.locator('#importUrl').fill('ftp://shop.example/p/1');
    await page.locator('#importBtn').click();
    await expect(page.locator('.alert-warning')).toBeFocused();
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });

    test('shows its examples and the copy name in German', async ({ page }) => {
      await page.goto('/wardrobe/new');
      await expect(page.locator('#garment-name')).toHaveAttribute(
        'placeholder',
        /^Zum Beispiel: /,
      );
      const show = await createGarment(page.request, { name: 'Mantel' });
      await page.goto(`${show}/clone`);
      await expect(page.locator('#garment-name')).toHaveValue('Mantel (Kopie)');
    });
  });

  test.describe('in Russian at 320 px', () => {
    test.use({ locale: 'ru-RU' });

    test('keeps the heading and the long values in the column', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      const show = await createGarment(page.request, {
        name: 'Двубортноепальтоизверблюжьейшерстиоченьдлинное',
        brand: 'Averyveryverylongbrandnamewithnobreaks',
        sourceUrl: `https://shop.example/${'p'.repeat(120)}`,
      });
      await page.goto(`${show}/edit`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
      expect(await fitsItsColumn(page, 'main h1')).toBe(true);
    });
  });
});
