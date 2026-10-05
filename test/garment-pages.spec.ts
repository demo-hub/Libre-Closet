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

test.describe('the garment page', () => {
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

  test('offers the mask editor by name to someone who can edit', async ({
    page,
  }, info) => {
    const response = await page.request.post('/wardrobe/import', {
      multipart: {
        name: `Photo ${info.project.name}`,
        category: 'outerwear',
        photo: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
        nobgPhoto: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto(new URL(response.url()).pathname);
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
});

test.describe('the garment form', () => {
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

  test('does not scroll sideways at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/wardrobe/new');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });
});
