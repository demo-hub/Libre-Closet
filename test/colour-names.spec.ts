import { test, expect, type APIRequestContext } from '@playwright/test';

const form = (request: APIRequestContext, path: string, fields: string[][]) =>
  request.post(path, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams(fields).toString(),
  });

async function createGarment(
  request: APIRequestContext,
  fields: string[][],
  category = 'tops',
): Promise<string> {
  const response = await form(request, '/wardrobe', [
    ['category', category],
    ...fields,
  ]);
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' });

  test('a garment names its known colours in French, and a custom one as typed', async ({
    page,
  }, info) => {
    await page.goto(
      await createGarment(page.request, [
        ['name', `Colours ${info.project.name}`],
        ['color', 'red'],
        ['color', 'pattern'],
        ['color', 'bleu nuit'],
      ]),
    );
    await expect(
      page.getByRole('definition').filter({ hasText: 'Rouge' }),
    ).toHaveText('Rouge, À motifs, bleu nuit');
  });

  test('the filter sheet and its pill use the names, and the address the value', async ({
    page,
  }) => {
    await page.goto('/wardrobe');
    await page.locator('#filter-button').click();
    const colours = page
      .getByRole('dialog')
      .getByRole('group', { name: 'Couleur' });
    await colours.getByRole('radio', { name: 'Marron' }).check();
    await page.getByRole('button', { name: 'Appliquer les filtres' }).click();
    await expect(page).toHaveURL(/[?&]color=brown\b/);
    await expect(
      page.getByRole('link', { name: /Couleur\s: Marron/ }),
    ).toBeVisible();
  });

  test('a filter on a custom colour shows it as typed', async ({ page }) => {
    await page.goto('/wardrobe?color=bleu%20nuit');
    await expect(
      page.getByRole('link', { name: /Couleur\s: bleu nuit/ }),
    ).toBeVisible();
  });

  test('an outfit row names them, on the page and in the row it swaps in', async ({
    page,
  }, info) => {
    const category = `couleurs-${info.project.name}`.replace(/\W/g, '-');
    const fields = [
      ['color', 'red'],
      ['color', 'bleu nuit'],
    ];
    const first = await createGarment(
      page.request,
      [['name', 'Premier'], ...fields],
      category,
    );
    await createGarment(
      page.request,
      [['name', 'Second'], ...fields],
      category,
    );
    const outfit = await form(page.request, '/outfits', [
      ['name', `Tenue ${info.project.name}`],
      ['notes', ''],
      ['category', category],
      ['garmentId', first.split('/').pop()!],
    ]);
    expect(outfit.ok()).toBeTruthy();
    await page.goto(`${new URL(outfit.url()).pathname}/edit`);
    const row = page.locator('#outfit-rows-list > .outfit-row');
    const garment = row.locator('[data-garment-color]');
    await expect(garment).toHaveAttribute(
      'data-garment-color',
      'Rouge, bleu nuit',
    );
    await row.getByRole('button', { name: /^Précédent/ }).click();
    await expect(garment).toHaveAttribute('data-garment-name', 'Second');
    await expect(garment).toHaveAttribute(
      'data-garment-color',
      'Rouge, bleu nuit',
    );
  });

  test.describe('the colour field', () => {
    const summary = '[data-color-field] summary';
    const search = 'Rechercher ou créer';

    test('names its options and pills, and submits the value', async ({
      page,
    }) => {
      await page.goto('/wardrobe/new');
      await page.locator(summary).click();
      const red = page.locator('input[name="color"][value="red"]');
      await expect(red).toHaveAttribute('data-label', 'Rouge');
      await page.locator('.ms-option', { has: red }).click();
      await expect(page.locator('.ms-pills')).toContainText('Rouge');
      await expect(
        page.getByRole('button', { name: 'Retirer Rouge' }),
      ).toBeVisible();
    });

    test('finds a colour by its French name, with nothing to create', async ({
      page,
    }) => {
      await page.goto('/wardrobe/new');
      await page.locator(summary).click();
      await page.getByRole('textbox', { name: search }).fill('rouge');
      await expect(page.locator('.ms-option:not(.hidden)')).toHaveCount(1);
      await expect(page.locator('.ms-option:not(.hidden)')).toContainText(
        'Rouge',
      );
      await expect(page.locator('.ms-create')).toBeHidden();
    });

    test('still finds it by the stored name', async ({ page }) => {
      await page.goto('/wardrobe/new');
      await page.locator(summary).click();
      await page.getByRole('textbox', { name: search }).fill('red');
      await expect(page.locator('.ms-option:not(.hidden)')).toHaveCount(1);
      await expect(page.locator('.ms-create')).toBeHidden();
    });

    test('shows a saved custom colour as typed on the edit page', async ({
      page,
    }, info) => {
      const show = await createGarment(page.request, [
        ['name', `Custom ${info.project.name}`],
        ['color', 'green'],
        ['color', 'bleu nuit'],
      ]);
      await page.goto(`${show}/edit`);
      await expect(page.locator('.ms-pills')).toContainText('Vert');
      await expect(page.locator('.ms-pills')).toContainText('bleu nuit');
    });
  });
});
