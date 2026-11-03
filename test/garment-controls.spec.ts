import { readFileSync } from 'fs';
import { join } from 'path';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import sharp from 'sharp';

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
  const show = await createGarment(request, [['name', name]]);
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

/** Red, green and blue bands, wider than tall: a photo the editor has to pad to a square. */
const bands = () =>
  sharp({
    create: { width: 300, height: 120, channels: 3, background: '#ff0000' },
  })
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 40,
            channels: 3,
            background: '#00ff00',
          },
        },
        top: 40,
        left: 0,
      },
      {
        input: {
          create: {
            width: 300,
            height: 40,
            channels: 3,
            background: '#0000ff',
          },
        },
        top: 80,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

const finePointer = (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: fine)').matches);

const colourBox = (page: Page) => page.locator('details.color-ms');

async function openMaskEditor(page: Page, name: string) {
  await page.goto(await createGarmentWithPhoto(page.request, name));
  const opener = page.getByRole('button', { name: 'Clean up background' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Clean up background' });
  await expect(dialog).toBeVisible();
  return { opener, dialog };
}

test.describe('the photo picker', () => {
  // Focusing the picker would otherwise start the background-removal model download.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() =>
      localStorage.setItem('bgRemovalEnabled', 'false'),
    );
  });

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
    await expect(page.getByRole('group', { name: 'Photo' })).toBeVisible();
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

  test('scrolls the whole button out from under the header for the keyboard', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    // The garment page's row wraps, which once left the 1 px input between its two lines.
    await page.goto(
      await createGarmentWithPhoto(
        page.request,
        `Scrolled ${info.project.name}`,
      ),
    );
    await page.locator('#photoCaptureBtn').focus();
    await page.evaluate(() =>
      window.scrollBy(
        0,
        document.getElementById('photoInput')!.getBoundingClientRect().top - 20,
      ),
    );
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#photoInput')).toBeFocused();
    const { top, headerBottom } = await page.evaluate(() => ({
      top: document
        .querySelector('label[for="photoInput"]')!
        .getBoundingClientRect().top,
      headerBottom: document
        .querySelector('.app-header')!
        .getBoundingClientRect().bottom,
    }));
    expect(top).toBeGreaterThanOrEqual(headerBottom);
  });

  test('takes a photo dropped on its button', async ({ page }) => {
    await page.goto('/wardrobe/new');
    const files = await page.evaluateHandle(
      (bytes) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], 'dropped.png', {
            type: 'image/png',
          }),
        );
        return transfer;
      },
      [...coat],
    );
    await page
      .locator('label[for="photoInput"]')
      .dispatchEvent('drop', { dataTransfer: files });
    await expect
      .poll(() =>
        page
          .locator('#photoInput')
          .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
      )
      .toBe('dropped.png');
    await expect(page.locator('#photoPreview')).toBeVisible();
  });

  test('names the chosen file on the garment page, until Back restores it', async ({
    page,
  }, info) => {
    const show = await createGarmentWithPhoto(
      page.request,
      `Picked ${info.project.name}`,
    );
    await page.goto(show);
    await page
      .locator('#photoInput')
      .setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: coat });
    await expect(page.locator('#photoFileName')).toHaveText('tee.png');
    await expect(page.locator('#photoFileName')).toBeVisible();
    await expect(page.locator('#photoBtn')).toBeEnabled();

    // The restored page has no file in its input, so it must not name one or offer to save it.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/wardrobe$/);
    await page.goBack();
    await expect(page).toHaveURL(show);
    await expect(page.locator('#photoFileName')).toBeHidden();
    await expect(page.locator('#photoBtn')).toBeDisabled();
  });

  test('shows no photo on the new-garment form brought back by Back', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    await page.locator('#bgRemovalToggle').uncheck();
    await page
      .locator('#photoInput')
      .setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: coat });
    await expect(page.locator('#photoPreview')).toBeVisible();

    // The restored file input is empty, so Save would post the garment without this photo.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/wardrobe$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/wardrobe\/new$/);
    await expect(page.locator('#photoPreview')).toBeHidden();
    await expect(page.locator('#photoPreviewPlaceholder')).toBeVisible();
  });
});

test.describe('the photo picker with site data blocked', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Site data is blocked', 'SecurityError');
        },
      });
    });
  });

  test("still replaces a garment's photo, and keeps removal off when turned off", async ({
    page,
  }, info) => {
    await page.goto(
      await createGarmentWithPhoto(
        page.request,
        `Blocked ${info.project.name}`,
      ),
    );
    await page.locator('#bgRemovalToggle').uncheck();
    await page
      .locator('#photoInput')
      .setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: coat });
    await expect(page.locator('#photoBtn')).toBeEnabled();
    await expect(page.locator('#bgStatus')).toBeHidden();
    await expect(page.locator('#maskEditorDialog')).toBeHidden();
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

  test('keeps its place under a dialog that opens over it', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    const search = page.getByRole('textbox', { name: 'Search or create' });
    await colourBox(page).locator('summary').click();
    await search.fill('bl');
    // As background removal does when it finishes: the editor opens on its own.
    const openEditor = () =>
      page.evaluate(async () => {
        const { openMaskEditor } = await import('/js/mask-editor.js');
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 8;
        const blob: Blob = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/png'),
        );
        void openMaskEditor(
          new File([blob], 'original.png', { type: 'image/png' }),
          blob,
        );
      });
    const editor = page.locator('#maskEditorDialog');

    await openEditor();
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('bl');
    await expect(colourBox(page)).toHaveAttribute('open', '');

    await openEditor();
    await editor.getByRole('button', { name: 'Skip' }).click();
    await expect(search).toBeFocused();
    await expect(colourBox(page)).toHaveAttribute('open', '');
  });

  test('ticks a colour pressed by its name and stays open', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    await colourBox(page).locator('summary').click();
    await page
      .locator('.ms-option')
      .filter({ has: page.locator('input[value="red"]') })
      .locator('.capitalize')
      .click();
    await expect(
      page.locator('input[name="color"][value="red"]'),
    ).toBeChecked();
    await expect(colourBox(page)).toHaveAttribute('open', '');
    await page.getByRole('heading', { name: 'New garment' }).click();
    await expect(colourBox(page)).not.toHaveAttribute('open');
  });

  test('creates a colour from the search and says what happened', async ({
    page,
  }) => {
    await page.goto('/wardrobe/new');
    const search = page.getByRole('textbox', { name: 'Search or create' });
    const status = page.locator('[data-color-field] [role="status"]');
    await colourBox(page).locator('summary').click();

    await search.fill(',,,');
    await expect(page.locator('.ms-create')).toBeHidden();
    await search.fill('zz');
    await expect(status).toHaveText('No matches');

    // Stored comma-joined, so the comma the user typed becomes a space.
    await search.fill('dusty, rose');
    await page.getByRole('button', { name: 'Create "dusty rose"' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ms-pills')).toHaveText('dusty rose');
    await expect(status).toHaveText('1 selected');
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(colourBox(page)).not.toHaveAttribute('open');

    await colourBox(page).locator('summary').click();
    const clear = page.getByRole('button', { name: 'Clear all' });
    const { height } = (await clear.boundingBox())!;
    expect(height).toBeGreaterThanOrEqual((await finePointer(page)) ? 24 : 44);
    await clear.click();
    await expect(page.locator('.ms-pills .ms-pill')).toHaveCount(0);
    await expect(status).toHaveText('0 selected');
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

  test('stores a colour without its markup, once, and shows it as text', async ({
    page,
  }, info) => {
    const planted = '<img src=x onerror="window.planted=1">';
    await page.goto(
      `${await createGarment(page.request, [
        ['name', `Escaped ${info.project.name}`],
        ['color', planted],
        ['color', 'navy "deep" & <b>dark</b>'],
        ['color', 'Navy "deep" & dark'],
      ])}/edit`,
    );
    const pills = page.locator('.ms-pills');
    // The tag is stripped on save, and the same colour in another case is a repeat.
    await expect(pills.locator('.ms-pill')).toHaveCount(1);
    await expect(pills).toContainText('navy "deep" & dark');
    await expect(pills).not.toContainText('onerror');
    await expect(page.locator('[data-color-field] img')).toHaveCount(0);
    expect(await page.evaluate(() => 'planted' in window)).toBe(false);

    await page
      .getByRole('button', { name: 'Remove navy "deep" & dark' })
      .click();
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

    test('counts and names in German word order', async ({ page }) => {
      await page.goto('/wardrobe/new');
      const summary = colourBox(page).locator('summary');
      await expect(summary).toHaveText('Farbe auswählen');
      await summary.click();
      await page.locator('input[name="color"][value="red"]').check();
      await expect(summary).toHaveText('1 ausgewählt');
      await expect(page.locator('.ms-count')).toHaveText('1 ausgewählt');
      await expect(
        page.getByRole('button', { name: 'red entfernen' }),
      ).toBeVisible();
      await page
        .getByRole('textbox', { name: 'Suchen oder erstellen' })
        .fill('teal');
      await expect(
        page.getByRole('button', { name: '„teal“ erstellen' }),
      ).toBeVisible();
    });

    test('keeps a long colour inside its pill and the open list at 320 px', async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        `${await createGarment(page.request, [
          ['name', `Long ${info.project.name}`],
          ['color', 'Averyveryverylongcolournamewithnobreaks'],
        ])}/edit`,
      );
      const fits = (selector: string) =>
        page
          .locator(selector)
          .evaluate(
            (el) =>
              el.scrollWidth <= el.clientWidth &&
              el.getBoundingClientRect().right <= innerWidth,
          );
      expect(await fits('.ms-pill')).toBe(true);
      await colourBox(page).locator('summary').click();
      await expect(page.locator('.ms-options')).toBeVisible();
      expect(await fits('.ms-dropdown')).toBe(true);
    });
  });
});

test.describe('the mask editor', () => {
  test('is a named dialog with pressed brushes and a labelled size', async ({
    page,
  }, info) => {
    const { opener, dialog } = await openMaskEditor(
      page,
      `Mask ${info.project.name}`,
    );
    await expect(
      dialog.getByRole('heading', { name: 'Clean up background', level: 2 }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('img', {
        name: 'Garment cut-out: paint on it to erase or restore the background',
      }),
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

    // No backdrop form: a stray press outside must not throw the painting away.
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    // The modal makes it inert; it must not still read as unavailable when focus returns.
    await expect(opener).not.toHaveAttribute('aria-disabled');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(opener).not.toHaveAttribute('aria-disabled');
  });

  test('hands back an available button while Accept saves', async ({
    page,
  }, info) => {
    const { opener, dialog } = await openMaskEditor(
      page,
      `Accepted ${info.project.name}`,
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/wardrobe\/\d+\/nobg/, async (route) => {
      await held;
      await route.continue();
    });
    await dialog.getByRole('button', { name: 'Accept' }).click();
    await expect(opener).toBeFocused();
    await expect(opener).not.toHaveAttribute('aria-disabled');
    release();
  });

  test('says a failed save and keeps the photo it had', async ({
    page,
  }, info) => {
    const { dialog } = await openMaskEditor(
      page,
      `Unsaved ${info.project.name}`,
    );
    await page.route(/\/wardrobe\/\d+\/nobg/, (route) =>
      route.fulfill({ status: 500 }),
    );
    await dialog.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Error: the cleaned-up photo could not be saved. The garment keeps its previous one.',
    );
    await expect(page.locator('main figure img')).toHaveAttribute(
      'src',
      /^\/file\/nobg\//,
    );
  });

  test('restores the pixels under the brush on a wide photo with no cut-out', async ({
    page,
  }, info) => {
    const show = await createGarment(page.request, [
      ['name', `Wide ${info.project.name}`],
    ]);
    const upload = await page.request.post(`${show}/photo`, {
      multipart: {
        photo: {
          name: 'bands.png',
          mimeType: 'image/png',
          buffer: await bands(),
        },
      },
    });
    expect(upload.ok()).toBeTruthy();
    await page.goto(show);
    await page.getByRole('button', { name: 'Clean up background' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clean up background' });
    const canvas = dialog.locator('canvas');
    await expect
      .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width))
      .toBeGreaterThan(1);
    const size = await canvas.evaluate((c: HTMLCanvasElement) => [
      c.width,
      c.height,
    ]);
    expect(size[0]).toBe(size[1]);

    // 40 % down the padded square is the red band; unpadded, it was the green one.
    const pixel = () =>
      canvas.evaluate((c: HTMLCanvasElement) =>
        Array.from(
          c.getContext('2d')!.getImageData(c.width / 2, c.height * 0.4, 1, 1)
            .data,
        ),
      );
    const before = await pixel();
    const box = (await canvas.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height * 0.4 };
    await page.mouse.click(at.x, at.y);
    expect((await pixel())[3]).toBe(0);
    await dialog.getByRole('button', { name: 'Restore' }).click();
    await page.mouse.click(at.x, at.y);
    const after = await pixel();
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(after[i] - before[i])).toBeLessThan(16);
    }
    expect(before[0]).toBeGreaterThan(200);
  });

  test('marks the pressed brush without colour in forced colours', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', 'forced colours: Chromium only');
    await page.emulateMedia({ forcedColors: 'active' });
    const { dialog } = await openMaskEditor(
      page,
      `Forced ${info.project.name}`,
    );
    const decoration = (name: string) =>
      dialog
        .getByRole('button', { name })
        .evaluate((button) => getComputedStyle(button).textDecorationLine);
    expect(await decoration('Erase')).toBe('underline');
    expect(await decoration('Restore')).toBe('none');
  });
});

test('the garment page logs nothing to the console', async ({ page }, info) => {
  const logs: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'log') logs.push(message.text());
  });
  await page.goto(
    await createGarmentWithPhoto(page.request, `Quiet ${info.project.name}`),
  );
  // Focusing the picker would start the 40 MB model download, so the page is left as loaded.
  await expect(page.locator('#photoInput')).toBeAttached();
  await page.waitForLoadState('networkidle');
  expect(logs).toEqual([]);
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
