import { readFileSync } from 'fs';
import { join } from 'path';
import { test, expect, type APIRequestContext } from '@playwright/test';

const coat = readFileSync(
  join(__dirname, '../scripts/screenshots/fixtures/camel-coat.png'),
);

const form = (request: APIRequestContext, path: string, fields: string[][]) =>
  request.post(path, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams(fields).toString(),
  });

async function createGarment(
  request: APIRequestContext,
  category: string,
  name: string,
): Promise<number> {
  const response = await form(request, '/wardrobe', [
    ['category', category],
    ['name', name],
  ]);
  expect(response.ok()).toBeTruthy();
  return Number(new URL(response.url()).pathname.split('/').pop());
}

async function addPhoto(request: APIRequestContext, garmentId: number) {
  const response = await request.post(`/wardrobe/${garmentId}/photo`, {
    multipart: {
      photo: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
      nobgPhoto: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
    },
  });
  expect(response.ok()).toBeTruthy();
}

/** An outfit whose rows are exactly these slots, in this order. */
async function createOutfit(
  request: APIRequestContext,
  name: string,
  slots: [string, number][],
  notes = '',
): Promise<string> {
  const response = await form(request, '/outfits', [
    ['name', name],
    ['notes', notes],
    ...slots.flatMap(([category, id]) => [
      ['category', category],
      ['garmentId', String(id)],
    ]),
  ]);
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

async function threePieceOutfit(
  request: APIRequestContext,
  tag: string,
  photos = false,
) {
  const top = await createGarment(request, 'tops', `Top ${tag}`);
  const bottom = await createGarment(request, 'bottoms', `Bottom ${tag}`);
  const shoes = await createGarment(request, 'footwear', `Shoes ${tag}`);
  if (photos)
    for (const id of [top, bottom, shoes]) await addPhoto(request, id);
  return createOutfit(request, `Outfit ${tag}`, [
    ['tops', top],
    ['bottoms', bottom],
    ['footwear', shoes],
  ]);
}

const rowLabels = (page: import('@playwright/test').Page) =>
  page
    .locator('#outfit-rows-list > .outfit-row')
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset.label),
    );

test.describe('the outfit pages', () => {
  test('are titled for what they show', async ({ page }, info) => {
    const show = await threePieceOutfit(
      page.request,
      `title ${info.project.name}`,
    );
    await page.goto('/outfits');
    await expect(page).toHaveTitle('Outfits');
    await page.goto(show);
    await expect(page).toHaveTitle(`Outfit title ${info.project.name}`);
    await page.goto(`${show}/edit`);
    await expect(page).toHaveTitle('Edit outfit');
    await page.goto('/outfits/new');
    await expect(page).toHaveTitle('Build an outfit');

    const untitled = await createOutfit(page.request, '', []);
    await page.goto(untitled);
    await expect(page).toHaveTitle('Untitled outfit');
    await expect(page.locator('h1')).toHaveText('Untitled outfit');
  });

  test('keep their back links on this site', async ({ page }, info) => {
    // The builder shows its form only once the wardrobe has a garment.
    const show = await threePieceOutfit(
      page.request,
      `back ${info.project.name}`,
    );
    await page.goto('/outfits/new?returnTo=javascript:alert(1)');
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/outfits',
    );
    await page.goto('/outfits/new?returnTo=https://example.org/');
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/outfits',
    );
    await page.goto(`${show}/edit?returnTo=//example.org/`);
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      show,
    );
    // From the calendar: back to the week it came from, and Start over keeps the day.
    await page.goto('/outfits/new?scheduleDate=2026-03-03&returnTo=/calendar');
    await expect(
      page.getByRole('link', { name: 'Start over' }),
    ).toHaveAttribute(
      'href',
      '/outfits/new?scheduleDate=2026-03-03&returnTo=%2Fcalendar',
    );
    await page.goto(`${show}/edit?returnTo=/calendar&returnToWeek=2026-03-02`);
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/calendar?week=2026-03-02',
    );
  });

  test('name the actions on an outfit and copy its link', async ({
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
      await threePieceOutfit(page.request, `actions ${info.project.name}`),
    );
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete outfit' }),
    ).toBeVisible();
    const share = page.locator('main button[data-copy]');
    await share.click();
    await expect(share).toHaveText('Copied');
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toMatch(/\/share\?shareableId=.+&type=outfit$/);
    await expect(share).toHaveText('Share');
  });

  test('list garments in the order the builder saved', async ({
    page,
  }, info) => {
    const show = await threePieceOutfit(
      page.request,
      `order ${info.project.name}`,
      true,
    );
    await page.goto(`${show}/edit`);
    const shoes = page.getByRole('group', { name: 'Footwear' });
    await shoes.getByRole('button', { name: 'Move up' }).click();
    await shoes.getByRole('button', { name: 'Move up' }).click();
    expect(await rowLabels(page)).toEqual(['Footwear', 'Tops', 'Bottoms']);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(show);
    await expect(page.locator('main ul li')).toHaveText([
      `Shoes order ${info.project.name}`,
      `Top order ${info.project.name}`,
      `Bottom order ${info.project.name}`,
    ]);
    const photos = (selector: string) =>
      page
        .locator(selector)
        .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));
    const saved = await photos('main ul li img');
    await page.goto('/outfits');
    expect(await photos(`main li:has(a[href="${show}"]) img`)).toEqual(saved);
  });
});

test.describe('the outfit builder', () => {
  test('names every control in a row and keeps the focus while cycling', async ({
    page,
  }, info) => {
    // A category no other test or run uses: cycling goes by position among its garments.
    const category = `cycle-${info.project.name.replace(/\W+/g, '-').toLowerCase()}-${Date.now().toString(36)}`;
    const first = await createGarment(
      page.request,
      category,
      `First ${info.project.name}`,
    );
    await createGarment(page.request, category, `Second ${info.project.name}`);
    await page.goto(
      `${await createOutfit(page.request, `Cycle ${info.project.name}`, [[category, first]])}/edit`,
    );
    const row = page.getByRole('group', { name: category });
    for (const name of ['Previous', 'Next', 'Remove row']) {
      await expect(row.getByRole('button', { name })).toBeVisible();
    }
    // A single row has nowhere to move.
    await expect(row.getByRole('button', { name: 'Move up' })).toBeHidden();
    await expect(row.getByRole('button', { name: 'Move down' })).toBeHidden();

    // Newest first, so after First comes the empty slot, then Second.
    const next = row.getByRole('button', { name: 'Next' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(row.locator('input[name="garmentId"]')).toHaveValue('');
    await expect(row).toContainText('No garment');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      row.getByRole('button', { name: `Second ${info.project.name}` }),
    ).toBeVisible();
    await expect(next).toBeFocused();
  });

  test('moves rows from the keyboard and says where they went', async ({
    page,
  }, info) => {
    await page.goto(
      `${await threePieceOutfit(page.request, `move ${info.project.name}`)}/edit`,
    );
    const tops = page.getByRole('group', { name: 'Tops' });
    await tops.getByRole('button', { name: 'Move down' }).focus();
    await page.keyboard.press('Enter');
    expect(await rowLabels(page)).toEqual(['Bottoms', 'Tops', 'Footwear']);
    await expect(page.locator('#outfit-rows-status')).toHaveText(
      'Tops: row 2 of 3',
    );
    await page.keyboard.press('Enter');
    expect(await rowLabels(page)).toEqual(['Bottoms', 'Footwear', 'Tops']);
    // Now last, its Move down is gone, so the focus moved to Move up.
    await expect(tops.getByRole('button', { name: 'Move up' })).toBeFocused();
  });

  test('removes a row and keeps the focus nearby', async ({ page }, info) => {
    await page.goto(
      `${await threePieceOutfit(page.request, `remove ${info.project.name}`)}/edit`,
    );
    await page
      .getByRole('group', { name: 'Tops' })
      .getByRole('button', { name: 'Remove row' })
      .click();
    expect(await rowLabels(page)).toEqual(['Bottoms', 'Footwear']);
    const removeBottoms = page
      .getByRole('group', { name: 'Bottoms' })
      .getByRole('button', { name: 'Remove row' });
    await expect(removeBottoms).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // No row left to go to.
    expect(await rowLabels(page)).toEqual([]);
    await expect(
      page.getByRole('combobox', { name: 'Category' }),
    ).toBeFocused();
  });

  test('adds a row on Enter in the category box instead of saving', async ({
    page,
  }, info) => {
    const show = await threePieceOutfit(
      page.request,
      `add ${info.project.name}`,
    );
    await page.goto(`${show}/edit`);
    const category = page.getByRole('combobox', { name: 'Category' });
    await category.fill('bags');
    await category.press('Enter');
    await expect(page.getByRole('group', { name: 'Bags' })).toBeVisible();
    await expect(page).toHaveURL(`${show}/edit`);
  });

  test('opens a garment in a named dialog that takes the focus', async ({
    page,
  }, info) => {
    await page.goto(
      `${await threePieceOutfit(page.request, `modal ${info.project.name}`)}/edit`,
    );
    const garment = page
      .getByRole('group', { name: 'Tops' })
      .getByRole('button', { name: `Top modal ${info.project.name}` });
    await garment.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {
      name: `Top modal ${info.project.name}`,
    });
    await expect(dialog).toBeVisible();
    // The backdrop is a second, unfocusable Close.
    await expect(dialog.locator('#garment-modal-close')).toBeFocused();
    const view = dialog.getByRole('link', { name: 'View garment' });
    await expect(view).toHaveAttribute('href', /^\/wardrobe\/\d+$/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(garment).toBeFocused();

    // A normal navigation, so Back finds what was typed in the builder.
    await page.getByLabel('Name').fill('Typed before leaving');
    await garment.focus();
    await page.keyboard.press('Enter');
    await expect(view).toHaveAttribute('hx-boost', 'false');
    await view.click();
    await expect(page).toHaveURL(/\/wardrobe\/\d+$/);
    await page.goBack();
    await expect(page.getByLabel('Name')).toHaveValue('Typed before leaving');
  });

  test('leaves the rows of an outfit with no garments empty', async ({
    page,
  }, info) => {
    await createGarment(page.request, 'tops', `Spare top ${info.project.name}`);
    await page.goto(`${await createOutfit(page.request, 'Bare', [])}/edit`);
    const chosen = await page
      .locator('#outfit-rows-list input[name="garmentId"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.every((value) => value === '')).toBe(true);
  });

  test.describe('with reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('creates Sortable without animation, on a direct load too', async ({
      page,
    }, info) => {
      await page.goto(
        `${await threePieceOutfit(page.request, `motion ${info.project.name}`)}/edit`,
      );
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as {
                Sortable: {
                  get(
                    el: Element | null,
                  ): { options: { animation: number } } | undefined;
                };
              }
            ).Sortable.get(document.getElementById('outfit-rows-list'))?.options
              .animation,
        ),
      ).toBe(0);
    });
  });
});

test.describe('the outfit list', () => {
  test('adds an outfit to the calendar from its card, by keyboard', async ({
    page,
  }, info) => {
    const top = await createGarment(
      page.request,
      'tops',
      `Top calendar ${info.project.name}`,
    );
    const show = await createOutfit(
      page.request,
      `Outfit calendar ${info.project.name}`,
      [['tops', top]],
      'Notes long enough to be clamped, which the link name must leave out.',
    );
    const id = show.split('/').pop();
    await page.goto('/outfits');
    await expect(page.locator(`main a[href="${show}"]`)).toHaveAccessibleName(
      `Outfit calendar ${info.project.name}`,
    );
    const menu = page
      .locator('main li')
      .filter({ has: page.locator(`a[href="${show}"]`) });
    const opener = menu.locator('summary');
    await expect(opener).toHaveAccessibleName('Add to calendar');
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(menu.locator('details')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(menu.locator('details')).not.toHaveAttribute('open');
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const date = menu.getByLabel('Add outfit to the calendar?');
    await expect(date).toHaveAttribute('id', `outfit-date-${id}`);
    await date.fill('2026-11-02');
    await menu.getByRole('button', { name: 'Save' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#calendar-status')).toHaveText(
      'Outfit added to the calendar',
    );
    await expect(menu.locator('details')).not.toHaveAttribute('open');
    await expect(opener).toBeFocused();
  });

  test.describe('in Russian at 320 px', () => {
    test.use({ locale: 'ru-RU' });

    test('keeps long names in the column', async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      const top = await createGarment(
        page.request,
        'tops',
        `Верх ${info.project.name}`,
      );
      const show = await createOutfit(
        page.request,
        'Оченьдлинноеназваниеобразабезединогопробела',
        [['tops', top]],
      );
      for (const path of ['/outfits', show, `${show}/edit`, '/outfits/new']) {
        await page.goto(path);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path,
        ).toBeLessThanOrEqual(320);
      }
    });
  });
});
