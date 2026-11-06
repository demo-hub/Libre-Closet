import { test, expect, type Page } from '@playwright/test';

/** Relative luminance and contrast, WCAG 2.2 section 1.4.3. */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The placeholder's colour and the field's background as sRGB, read through a canvas so any CSS colour form works. */
async function placeholderColors(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const field = document.querySelector(selector)!;
    const rgb = (color: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(field, '::placeholder');
    return {
      text: rgb(style.color).slice(0, 3),
      opacity: Number(style.opacity),
      alpha: rgb(style.color)[3],
      background: rgb(getComputedStyle(field).backgroundColor).slice(0, 3),
    };
  }, selector);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`placeholders, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('pass 4.5:1 on their field', async ({ page }) => {
      await page.goto('/wardrobe/new');
      for (const selector of [
        '#garmentForm input[name="name"]',
        '#garmentForm textarea[name="notes"]',
      ]) {
        const color = await placeholderColors(page, selector);
        expect(color.opacity).toBe(1);
        expect(color.alpha).toBe(255);
        expect(contrast(color.text, color.background)).toBeGreaterThan(4.5);
      }
    });
  });
}

// The ring is 2 px wide and sits 2 px off the control.
const RING = 4;

/** How far the focused control's ring reaches under the header or the dock; null if it is in a bar or a dialog. */
function hiddenByBars(page: Page) {
  return page.evaluate((ring) => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    if (el.closest('.app-header, .dock, dialog, .skip-link')) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.height) return null;
    const header = document.querySelector('.app-header')!;
    const dock = document.querySelector('.dock');
    const top = header.getBoundingClientRect().bottom;
    const bottom = dock?.checkVisibility()
      ? dock.getBoundingClientRect().top
      : innerHeight;
    return {
      name: el.getAttribute('name') ?? el.textContent?.trim(),
      above: Math.max(0, top - (rect.top - ring)),
      below: Math.max(0, rect.bottom + ring - bottom),
    };
  }, RING);
}

test.describe('a control reached with the keyboard', () => {
  test.use({ viewport: { width: 360, height: 568 } });

  test('stays clear of the dock, ring included, going forward', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'Tab skips links and buttons in WebKit',
    );
    await page.goto('/wardrobe/new');
    let checked = 0;
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
      const hidden = await hiddenByBars(page);
      if (!hidden) continue;
      checked++;
      expect(hidden).toMatchObject({ above: 0, below: 0 });
    }
    expect(checked).toBeGreaterThan(5);
  });
});

test.describe('on a short window', () => {
  test.use({ viewport: { width: 640, height: 400 } });

  test('a control stays clear of the header going backward', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'Tab skips links and buttons in WebKit',
    );
    await page.goto('/wardrobe/new');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('#garmentForm button[type="submit"]').last().focus();
    let checked = 0;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(50);
      const hidden = await hiddenByBars(page);
      if (!hidden) continue;
      checked++;
      expect(hidden).toMatchObject({ above: 0, below: 0 });
    }
    expect(checked).toBeGreaterThan(3);
  });
});

test.describe('with WCAG 1.4.12 text spacing', () => {
  const spacing = `* {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }`;

  /** The label's rendered box against the button's. */
  function labelBox(page: Page, selector: string) {
    return page.evaluate((selector) => {
      const button = document.querySelector<HTMLElement>(selector)!;
      button.lastChild!.textContent = 'A label of several words';
      button.style.width = '8rem';
      const range = document.createRange();
      range.selectNodeContents(button);
      const box = button.getBoundingClientRect();
      const label = range.getBoundingClientRect();
      return {
        lines: Math.round(
          label.height / parseFloat(getComputedStyle(button).lineHeight),
        ),
        top: box.top,
        bottom: box.bottom,
        labelTop: label.top,
        labelBottom: label.bottom,
      };
    }, selector);
  }

  test('a label that wraps stays inside its button', async ({ page }) => {
    await page.goto('/wardrobe');
    await page.addStyleTag({ content: spacing });
    const box = await labelBox(page, '#filter-button');
    expect(box.lines).toBeGreaterThan(1);
    expect(box.labelTop).toBeGreaterThanOrEqual(box.top);
    expect(box.labelBottom).toBeLessThanOrEqual(box.bottom);
  });
});

test('a button with one line of text keeps its height, and a square one its shape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 568 });
  await page.goto('/wardrobe');
  const line = (await page.locator('#filter-button').boundingBox())!;
  expect(line.height).toBeCloseTo(44, 1);
  await page.goto('/wardrobe/new');
  const circle = page.locator('main .btn-circle').first();
  await expect(circle).toBeVisible();
  const box = (await circle.boundingBox())!;
  expect(box.width).toBeCloseTo(box.height, 1);
});
