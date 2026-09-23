import { test, expect, type Page } from '@playwright/test';

const fixedElements = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          getComputedStyle(el).position === 'fixed' &&
          !el.closest('dialog:not([open])') &&
          el.getBoundingClientRect().height > 0,
      )
      .map((el) => el.tagName.toLowerCase() + '.' + el.classList[0]),
  );

test('search and filters sit in the page, so only the dock is fixed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/wardrobe?color=red');
  expect(await fixedElements(page)).toEqual(['nav.dock']);
  await expect(
    page.getByRole('searchbox', { name: 'Search garments' }),
  ).toBeVisible();
});

test('the filter sheet can be used from the keyboard', async ({ page }) => {
  await page.goto('/wardrobe');
  await page.locator('#filter-button').focus();
  await page.keyboard.press('Enter');

  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.locator('.modal-box').getByRole('button', { name: 'Close' }),
  ).toBeFocused();

  const colours = sheet.getByRole('group', { name: 'Colour' });
  const red = colours.getByRole('radio', { name: 'red' });
  await red.focus();
  await page.keyboard.press('Space');
  await expect(red).toBeChecked();
  await page.keyboard.press('ArrowRight');
  const pink = colours.getByRole('radio', { name: 'pink' });
  await expect(pink).toBeFocused();
  await expect(pink).toBeChecked();
  await expect(pink.locator('xpath=following-sibling::span[1]')).toHaveCSS(
    'outline-style',
    'solid',
  );

  await sheet.getByRole('button', { name: 'Apply filters' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]color=pink(&|$)/);
  await expect(sheet).toBeHidden();
  await expect(page.locator('#filter-button')).toBeFocused();
});

test('removing one filter keeps the others and the search', async ({
  page,
}) => {
  await page.goto(
    `/wardrobe?color=red&size=M&archived=true&keyword=${encodeURIComponent('a&b')}`,
  );
  await page.getByRole('link', { name: 'Remove filter: Colour: red' }).click();
  await expect(page).not.toHaveURL(/color=/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('size')).toBe('M');
  expect(params.get('archived')).toBe('true');
  expect(params.get('keyword')).toBe('a&b');
});

test('a search that finds nothing says so and keeps the field focused', async ({
  page,
}) => {
  await page.goto('/wardrobe');
  const search = page.getByRole('searchbox', { name: 'Search garments' });
  await search.fill('zzz-nothing-matches');
  await search.press('Enter');
  await expect(page).toHaveURL(/keyword=zzz-nothing-matches/);
  await expect(page.locator('main')).toContainText('No matches');
  await expect(page.locator('main')).not.toContainText('No garments yet');
  await expect(search).toBeFocused();
});

test('an archived garment is labelled, not just faded', async ({
  page,
}, info) => {
  const name = `Badge ${info.project.name} ${Date.now()}`;
  const created = await page.request.post('/wardrobe', {
    form: { name, category: 'tops' },
  });
  const id = new URL(created.url()).pathname.split('/').pop();
  await page.request.post(`/wardrobe/${id}/archive`, {
    headers: { 'hx-request': 'true' },
  });

  await page.goto(
    `/wardrobe?archived=true&keyword=${encodeURIComponent(name)}`,
  );
  const card = page.getByRole('link', { name: new RegExp(name) });
  await expect(card.locator('.badge')).toHaveText('Archived');
  await expect(card).not.toHaveCSS('opacity', /^0\./);
});

for (const path of [
  '/wardrobe',
  `/wardrobe?keyword=zzz&color=red&archived=true&size=${'Extralongsizelabel'.repeat(4)}`,
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

for (const viewport of [
  { width: 320, height: 640 },
  { width: 640, height: 400 },
]) {
  test(`focus in the filter sheet stays in view at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/wardrobe');
    await page.locator('#filter-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#filter-close')).toBeFocused();
    await page.waitForFunction(() =>
      document
        .querySelector('#filter-modal .modal-box')!
        .getAnimations()
        .every((animation) => animation.playState === 'finished'),
    );

    const covered = () =>
      page.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        const shown =
          (focused.matches('input[type=radio]')
            ? focused.nextElementSibling
            : focused.closest('label')) ?? focused;
        const box = shown.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return hit && (shown.contains(hit) || focused.contains(hit))
          ? null
          : `${focused.outerHTML.slice(0, 80)} is under ${hit?.outerHTML.slice(0, 80)}`;
      });

    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab');
      expect(await covered()).toBeNull();
      if (await page.locator('#filter-modal input[type=radio]:focus').count()) {
        // ArrowLeft wraps to the group's last chip, the one furthest down.
        await page.keyboard.press('ArrowLeft');
        expect(await covered()).toBeNull();
      }
      if (
        await page
          .getByRole('button', { name: 'Apply filters' })
          .evaluate((b) => b === document.activeElement)
      )
        break;
    }
    await expect(
      page.getByRole('button', { name: 'Apply filters' }),
    ).toBeFocused();
  });
}

test('after Back, a search does not bring back the filter just left', async ({
  page,
}) => {
  await page.goto('/wardrobe');
  await page.locator('#filter-button').click();
  await page.getByRole('radio', { name: 'red' }).check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/color=red/);

  await page.goBack();
  await expect(page).not.toHaveURL(/color=red/);
  await expect(
    page.getByRole('link', { name: 'Remove filter: Colour: red' }),
  ).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Search garments' });
  await search.fill('zzz');
  await search.press('Enter');
  await expect(page).toHaveURL(/keyword=zzz/);
  expect(new URL(page.url()).searchParams.get('color') ?? '').toBe('');
});

test('Back and Forward do not bring the filter sheet back open', async ({
  page,
}) => {
  await page.goto('/wardrobe');
  await page.locator('#filter-button').click();
  await page.getByRole('radio', { name: 'red' }).check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/color=red/);
  await page.locator('#filter-button').click();
  await expect(page.locator('#filter-modal')).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/color=red/);
  await page.goForward();
  await expect(page).toHaveURL(/color=red/);
  await expect(page.locator('#filter-modal')).toBeHidden();
});

test.describe('in Russian at 320 px', () => {
  test.use({ locale: 'ru-RU' });
  test("the sheet's buttons stay on screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/wardrobe');
    await page.locator('#filter-button').click();
    for (const box of await page
      .locator('#filter-modal .modal-action .btn')
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getBoundingClientRect().toJSON() as DOMRect),
      )) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(320);
    }
  });
});
