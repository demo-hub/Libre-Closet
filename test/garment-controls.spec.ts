import { readFileSync } from 'fs';
import { join } from 'path';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const coat = readFileSync(
  join(__dirname, '../scripts/screenshots/fixtures/camel-coat.png'),
);

/** Repeated `color` fields, the way the multiselect submits them. */
async function createGarment(
  request: APIRequestContext,
  fields: [string, string][],
): Promise<string> {
  const response = await request.post('/wardrobe', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams([['category', 'tops'], ...fields]).toString(),
  });
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

async function createGarmentWithPhoto(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const response = await request.post('/wardrobe/import', {
    multipart: {
      name,
      category: 'outerwear',
      photo: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
      nobgPhoto: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
    },
  });
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

const finePointer = (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: fine)').matches);

const colourBox = (page: Page) => page.locator('details.color-ms');

test.describe('the photo picker', () => {
  test('opens the file chooser from its Choose photo button', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    await expect(page.getByLabel('Choose photo')).toHaveAttribute(
      'id',
      'photoInput',
    );
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label[for="photoInput"]').click(),
    ]);
    expect(await chooser.element().getAttribute('id')).toBe('photoInput');
    expect(await chooser.element().getAttribute('capture')).toBeNull();
    expect(chooser.isMultiple()).toBe(false);
    await expect(page.locator('#bgStatus')).toHaveAttribute('role', 'status');
  });

  test('rings the button while the keyboard is on its input', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    await page.locator('#photoCaptureBtn').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#photoInput')).toBeFocused();
    const ring = await page
      .locator('label[for="photoInput"]')
      .evaluate((label) => {
        const { outlineStyle, outlineWidth } = getComputedStyle(label);
        return { outlineStyle, outlineWidth: parseFloat(outlineWidth) };
      });
    expect(ring.outlineStyle).toBe('solid');
    expect(ring.outlineWidth).toBeGreaterThanOrEqual(2);
  });

  test('names the chosen file on the garment page', async ({ page }, info) => {
    await page.goto(
      await createGarmentWithPhoto(page.request, `Picked ${info.project.name}`),
    );
    await page.locator('#bgRemovalToggle').uncheck();
    await page
      .locator('#photoInput')
      .setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: coat });
    await expect(page.locator('#photoFileName')).toHaveText('tee.png');
    await expect(page.locator('#photoFileName')).toBeVisible();
  });
});

test.describe('the colour multiselect', () => {
  test('works from the keyboard and closes when left', async ({ page }) => {
    await page.goto('/wardrobe/new');
    const summary = colourBox(page).locator('summary');
    const search = page.getByRole('textbox', { name: 'Search or create' });
    const fine = await finePointer(page);
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(colourBox(page)).toHaveAttribute('open', '');
    // On a touch screen the search is left alone, so the keyboard does not cover the list.
    if (fine) await expect(search).toBeFocused();
    else await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(page.locator('.ms-pills .ms-pill')).toHaveCount(1);
    await expect(summary).toHaveText('1 selected');

    await page.keyboard.press('Escape');
    await expect(colourBox(page)).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();

    await page.keyboard.press('Enter');
    if (fine) await expect(search).toBeFocused();
    await page.getByRole('button', { name: 'Clear all' }).focus();
    await page.keyboard.press('Tab');
    await expect(colourBox(page)).not.toHaveAttribute('open');
  });

  test('removes a colour by name and keeps the focus nearby', async ({
    page,
  }, info) => {
    await page.goto(
      `${await createGarment(page.request, [
        ['name', `Removed ${info.project.name}`],
        ['color', 'beige'],
        ['color', 'blue'],
      ])}/edit`,
    );
    const removeBlue = page.getByRole('button', { name: 'Remove blue' });
    const box = await removeBlue.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(
      (await finePointer(page)) ? 24 : 44,
    );

    await removeBlue.click();
    await expect(
      page.locator('input[name="color"][value="blue"]'),
    ).not.toBeChecked();
    await expect(colourBox(page)).not.toHaveAttribute('open');
    const removeBeige = page.getByRole('button', { name: 'Remove beige' });
    await expect(removeBeige).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('.ms-pills .ms-pill')).toHaveCount(0);
    await expect(colourBox(page).locator('summary')).toBeFocused();
  });

  test('shows a colour as text, whatever it contains', async ({
    page,
  }, info) => {
    const planted = '<img src=x onerror="window.planted=1">';
    await page.goto(
      `${await createGarment(page.request, [
        ['name', `Escaped ${info.project.name}`],
        ['color', planted],
        ['color', 'navy "deep"'],
      ])}/edit`,
    );
    const pills = page.locator('.ms-pills');
    await expect(pills).toContainText(planted);
    await expect(page.locator('[data-color-field] img')).toHaveCount(0);
    expect(await page.evaluate(() => 'planted' in window)).toBe(false);

    await page.getByRole('button', { name: 'Remove navy "deep"' }).click();
    await expect(pills).not.toContainText('navy');
  });

  test('still works on a page brought back by Back', async ({ page }, info) => {
    const show = await createGarment(page.request, [
      ['name', `Restored ${info.project.name}`],
    ]);
    await page.goto(`${show}/edit`);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(show);
    await page.goBack();
    await expect(page).toHaveURL(`${show}/edit`);
    await colourBox(page).locator('summary').click();
    await page.locator('input[name="color"][value="red"]').check();
    await expect(page.locator('.ms-pills')).toContainText('red');
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });

    test('counts in German', async ({ page }) => {
      await page.goto('/wardrobe/new');
      const summary = colourBox(page).locator('summary');
      await expect(summary).toHaveText('Farbe auswählen');
      await summary.click();
      await page.locator('input[name="color"][value="red"]').check();
      await expect(summary).toHaveText('1 ausgewählt');
      await expect(page.locator('.ms-count')).toHaveText('1 ausgewählt');
    });

    test('keeps the open list and a long colour on screen at 320 px', async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        `${await createGarment(page.request, [
          ['name', `Long ${info.project.name}`],
          ['color', 'Averyveryverylongcolournamewithnobreaks'],
        ])}/edit`,
      );
      await colourBox(page).locator('summary').click();
      await expect(page.locator('.ms-options')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });
  });
});

test.describe('the mask editor', () => {
  test('is a named dialog with pressed brushes and a labelled size', async ({
    page,
  }, info) => {
    await page.goto(
      await createGarmentWithPhoto(page.request, `Mask ${info.project.name}`),
    );
    const opener = page.getByRole('button', { name: 'Clean up background' });
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Clean up background' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Clean up background', level: 2 }),
    ).toBeVisible();
    const erase = dialog.getByRole('button', { name: 'Erase' });
    const restore = dialog.getByRole('button', { name: 'Restore' });
    await expect(erase).toBeFocused();
    await expect(erase).toHaveAttribute('aria-pressed', 'true');
    await expect(restore).toHaveAttribute('aria-pressed', 'false');
    await expect(
      dialog.getByRole('slider', { name: 'Brush size' }),
    ).toBeVisible();

    await restore.click();
    await expect(restore).toHaveAttribute('aria-pressed', 'true');
    await expect(erase).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a modal still takes the focus when it opens', async ({
    page,
  }, info) => {
    await page.goto('/wardrobe');
    await page.locator('#filter-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#filter-close')).toBeFocused();

    await page.goto(
      await createGarmentWithPhoto(page.request, `Still ${info.project.name}`),
    );
    await page.getByRole('button', { name: 'Clean up background' }).click();
    await expect(page.getByRole('button', { name: 'Erase' })).toBeFocused();
  });
});
