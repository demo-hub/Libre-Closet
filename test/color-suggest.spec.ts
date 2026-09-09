import { expect, test } from '@playwright/test';

/**
 * Colour suggestion from the cut-out. Everything here runs in the page, which
 * is the only place canvas and createImageBitmap exist — and the only place
 * the module is ever loaded from.
 *
 * Background removal itself is never triggered: producing a real cut-out means
 * downloading the ~40 MB model. The blobs below are what it would hand back,
 * so the suggestion is exercised end to end from that point on.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/wardrobe/new');
});

test.describe('reading a pixel', () => {
  test('names the palette colour it belongs to', async ({ page }) => {
    const named = await page.evaluate(async () => {
      const { colorOf } = await import('/js/color-suggest.js');
      return {
        black: colorOf(10, 10, 10),
        white: colorOf(250, 250, 250),
        grey: colorOf(128, 128, 128),
        navy: colorOf(20, 30, 90),
        red: colorOf(200, 20, 20),
        olive: colorOf(90, 110, 40),
        beige: colorOf(214, 196, 162),
        brown: colorOf(110, 70, 30),
        pink: colorOf(230, 120, 180),
        purple: colorOf(120, 60, 180),
        mustard: colorOf(210, 180, 40),
      };
    });

    expect(named).toEqual({
      black: 'black',
      white: 'white',
      grey: 'grey',
      navy: 'blue',
      red: 'red',
      olive: 'green',
      beige: 'beige',
      brown: 'brown',
      pink: 'pink',
      purple: 'purple',
      mustard: 'yellow',
    });
  });

  test('never guesses a finish from a pixel', async ({ page }) => {
    // Gold and silver are how a thing is made, not what colour it reads as;
    // guessing them would rename every beige and grey garment.
    const guesses = await page.evaluate(async () => {
      const { colorOf } = await import('/js/color-suggest.js');
      const out = new Set<string>();
      for (let r = 0; r < 256; r += 15)
        for (let g = 0; g < 256; g += 15)
          for (let b = 0; b < 256; b += 15) out.add(colorOf(r, g, b));
      return [...out];
    });
    expect(guesses).not.toContain('gold');
    expect(guesses).not.toContain('silver');
  });
});

test.describe('reading a whole cut-out', () => {
  test('ignores what the background removal took away', async ({ page }) => {
    const colors = await page.evaluate(async () => {
      const { bucketPixels } = await import('/js/color-suggest.js');
      // Two thirds transparent, one third solid red: the garment is red, not
      // mostly nothing.
      const data = new Uint8ClampedArray(4 * 30);
      for (let i = 0; i < 10; i++) {
        data[i * 4] = 200;
        data[i * 4 + 3] = 255;
      }
      return bucketPixels(data);
    });
    expect(colors).toEqual(['red']);
  });

  test('says nothing about a garment it cannot see', async ({ page }) => {
    const colors = await page.evaluate(async () => {
      const { bucketPixels } = await import('/js/color-suggest.js');
      return bucketPixels(new Uint8ClampedArray(4 * 20));
    });
    expect(colors).toEqual([]);
  });

  test('leaves out a colour that is only a trim', async ({ page }) => {
    const colors = await page.evaluate(async () => {
      const { bucketPixels } = await import('/js/color-suggest.js');
      const data = new Uint8ClampedArray(4 * 100);
      for (let i = 0; i < 100; i++) {
        const blue = i >= 95;
        data[i * 4] = blue ? 20 : 200;
        data[i * 4 + 2] = blue ? 200 : 20;
        data[i * 4 + 3] = 255;
      }
      return bucketPixels(data);
    });
    expect(colors).toEqual(['red']);
  });

  test('calls three colours in equal measure a pattern', async ({ page }) => {
    const colors = await page.evaluate(async () => {
      const { bucketPixels } = await import('/js/color-suggest.js');
      const data = new Uint8ClampedArray(4 * 99);
      const shades = [
        [200, 20, 20],
        [20, 200, 20],
        [20, 20, 200],
      ];
      for (let i = 0; i < 99; i++) {
        const [r, g, b] = shades[i % 3];
        data.set([r, g, b, 255], i * 4);
      }
      return bucketPixels(data);
    });
    expect(colors[0]).toBe('pattern');
  });
});

test.describe('what it does to the form', () => {
  /** The palette is behind a dropdown, the way the user finds it. */
  const openPalette = async (page: import('@playwright/test').Page) => {
    await page.locator('.color-ms > summary').click();
    await expect(page.locator('.ms-options')).toBeVisible();
  };

  const suggest = (page: import('@playwright/test').Page, css: string) =>
    page.evaluate(async (color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 100, 60);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const { applyColorSuggestion, suggestColorsFromBlob } =
        await import('/js/color-suggest.js');
      return applyColorSuggestion(await suggestColorsFromBlob(blob));
    }, css);

  test('ticks the boxes and redraws the pills', async ({ page }) => {
    expect(await suggest(page, '#1b3a8f')).toEqual(['blue']);
    await expect(
      page.locator('input[name="color"][value="blue"]'),
    ).toBeChecked();
    // The pills only redraw if the change event reached the multiselect.
    await expect(page.locator('.ms-pills')).toContainText('blue');
  });

  test('says the colour was suggested, until it is touched', async ({
    page,
  }) => {
    await suggest(page, '#1b3a8f');
    await expect(page.locator('[data-suggested="colors"]')).toBeVisible();

    await openPalette(page);
    await page.locator('input[name="color"][value="red"]').check();
    await expect(page.locator('[data-suggested="colors"]')).toHaveCount(0);
  });

  test('never overrules a colour the user already chose', async ({ page }) => {
    await openPalette(page);
    await page.locator('input[name="color"][value="green"]').check();
    expect(await suggest(page, '#1b3a8f')).toEqual([]);

    await expect(
      page.locator('input[name="color"][value="green"]'),
    ).toBeChecked();
    await expect(
      page.locator('input[name="color"][value="blue"]'),
    ).not.toBeChecked();
  });

  test('does nothing on a page with no palette to fill in', async ({
    page,
  }) => {
    // The garment page carries the same picker but only replaces a photo.
    const applied = await page.evaluate(async () => {
      const { suggestGarmentColors } = await import('/js/color-suggest.js');
      const bare = document.createElement('div');
      return suggestGarmentColors(new Blob(['not even an image']), bare);
    });
    expect(applied).toEqual([]);
  });

  test('suggests nothing when it read nothing', async ({ page }) => {
    const applied = await page.evaluate(async () => {
      const { applyColorSuggestion } = await import('/js/color-suggest.js');
      return applyColorSuggestion([]);
    });
    expect(applied).toEqual([]);
    await expect(page.locator('[data-suggested="colors"]')).toHaveCount(0);
  });
});

/**
 * The whole path, with the removal library stubbed: producing a real cut-out
 * would download the ~40 MB model, but everything after it — the mask editor,
 * the hidden nobg input, the onNobg hook and the suggestion — is the real code.
 */
test('a photo run through the pipeline suggests its colours', async ({
  page,
}) => {
  const NAVY_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABAklEQVR4nO3WQW0EUAzE0PIoE5NcyFMO3UP0pXcIActW5ue3z9zn3wx+wPt8JRCAAbjLihgYgGNg7y4BCQfgGNh9ihIOwF3b5IkE4K6NMmMCcC+dIR2AY2D3KUo4AHdtkycSgLs2yowJwL10hnQAjoHdpyjhANy1TZ5IAO7aKDMmAPfSGdIBOAZ2n6KEA3DXNnkiAbhro8yYANxLZ0gH4BjYfYoSDsBd2+SJBOCujTJjAnAvnSEdgGNg9ylKOAB3bZMnEoC7NsqMCcC9dIZ0AI6B3aco4QDctU2eSADu2igzJgD30hnSATgGdp+ihANw1zZ5IgG4a6PMmADcS2dI9x3APzRGLcJUhq7QAAAAAElFTkSuQmCC';

  await page.route('**/modules/background-removal/index.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        const bytes = Uint8Array.from(atob('${NAVY_PNG}'), (c) => c.charCodeAt(0));
        export const preload = async () => {};
        export const removeBackground = async () =>
          new Blob([bytes], { type: 'image/png' });
      `,
    }),
  );

  await page.goto('/wardrobe/new');
  await page.locator('#bgRemovalToggle').check();
  await page.locator('#photoInput').setInputFiles({
    name: 'coat.png',
    mimeType: 'image/png',
    buffer: Buffer.from(NAVY_PNG, 'base64'),
  });

  // The editor opens as it does for any photo; dismissing it keeps the cut-out.
  await expect(page.locator('#maskEditorDialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.locator('input[name="color"][value="blue"]')).toBeChecked();
  await expect(page.locator('[data-suggested="colors"]')).toBeVisible();
  await expect(page.locator('.ms-pills')).toContainText('blue');
});
