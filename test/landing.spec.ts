import { test, expect, Page } from '@playwright/test';

const SOURCE_URL =
  process.env.SOURCE_URL || 'https://github.com/demo-hub/Libre-Closet';
const IMAGE_NAME = process.env.IMAGE_NAME || 'ghcr.io/demo-hub/libre-closet';
const OPERATOR_NAME = process.env.OPERATOR_NAME || '';
const OPERATOR_CONTACT = process.env.OPERATOR_CONTACT || '';

type JsonLd = Record<string, unknown> & {
  itemListElement?: { name: string }[];
  potentialAction?: { target: string };
};

const jsonLd = async (page: Page): Promise<JsonLd[]> =>
  (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).map((text) => JSON.parse(text) as JsonLd);

/** Stands in for the clipboard, so a copy can be checked in every engine. */
const fakeClipboard = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as unknown as { copied: string }).copied = text;
          return Promise.resolve();
        },
      },
    });
  });

/** Font sizes of the headings in <main>, which brand rule 4 keeps at the h3 size or above. */
const headingSizes = (page: Page) =>
  page
    .locator('main')
    .locator('h1, h2, h3')
    .evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent?.trim() ?? '',
        size: parseFloat(getComputedStyle(el).fontSize),
      })),
    );

test.describe('the landing page', () => {
  test('names its actions, with the hero mark left out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.carousel')).toHaveCount(0);
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', {
        level: 1,
        name: 'Your wardrobe. Your data.',
      }),
    ).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'Open wardrobe' }),
    ).toHaveAttribute('href', '/wardrobe');
    const source = main.getByRole('link', { name: 'Source on GitHub' });
    await expect(source).toHaveAttribute('href', SOURCE_URL);
    await expect(source).toHaveAttribute('rel', /noopener/);
    await expect(main.getByRole('link', { name: 'Register' })).toHaveCount(0);
    await expect(
      main.locator('section').first().locator('svg'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  test('lists nine features under "What it does", none smaller than the h3 size', async ({
    page,
  }) => {
    await page.goto('/');
    const features = page.locator('#features');
    await expect(
      features.getByRole('heading', { level: 2, name: 'What it does' }),
    ).toBeVisible();
    await expect(features.getByRole('listitem')).toHaveCount(9);
    await expect(features.getByRole('heading', { level: 3 })).toHaveCount(9);
    const sizes = await headingSizes(page);
    expect(sizes.length).toBeGreaterThan(0);
    for (const { text, size } of sizes) {
      expect(size, text).toBeGreaterThanOrEqual(19);
    }
  });

  test('reaches every control by Tab, each with a visible ring', async ({
    page,
  }) => {
    await fakeClipboard(page);
    await page.goto('/');
    await page.locator('main').focus();
    const expected = [
      'Open wardrobe',
      'Source on GitHub',
      'Screenshots',
      'Copy command',
      'Source code',
      'About',
      'Privacy',
      'Terms',
    ];
    for (const name of expected) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveAccessibleName(name);
      const ring = await focused.evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(ring, name).toEqual({ style: 'solid', width: '2px' });
    }
  });

  test('copies the docker command and says so in the button', async ({
    page,
  }) => {
    await fakeClipboard(page);
    await page.goto('/');
    await expect(page.locator('main pre code')).toContainText(IMAGE_NAME);
    const copy = page.locator('main button[data-copy]');
    await expect(copy).toHaveAccessibleName('Copy command');
    await copy.click();
    await expect(copy).toHaveText('Copied');
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toBe(
      `docker run -d -p 3000:3000 -v librecloset_data:/app/data ${IMAGE_NAME}`,
    );
    await expect(copy).toHaveText('Copy command');
  });

  test('leaves "Copied" out of a page restored by Back', async ({ page }) => {
    await fakeClipboard(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy command' }).click();
    await page
      .locator('main footer')
      .getByRole('link', { name: 'About', exact: true })
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await page.goBack();
    await expect(page.locator('main button[data-copy]')).toHaveText(
      'Copy command',
    );
  });

  test('offers no copy button where the browser has no clipboard', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
    });
    await page.goto('/');
    await expect(page.locator('main pre code')).toBeVisible();
    const copy = page.locator('main button[data-copy]');
    await expect(copy).toHaveCount(1);
    await expect(copy).toBeHidden();
  });

  test('ends with the credit and a navigation of source, About, privacy and terms', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.locator('main footer');
    await expect(footer).toContainText('Originally built by Lazztech LLC.');
    const links = footer.getByRole('navigation').getByRole('link');
    await expect(links).toHaveText([
      'Source code',
      'About',
      'Privacy',
      'Terms',
    ]);
    const hrefs = await links.evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')),
    );
    expect(hrefs).toEqual([SOURCE_URL, '/about', '/privacy', '/terms']);
    for (const box of await links.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    )) {
      expect(box).toBeGreaterThanOrEqual(24);
    }
  });

  test('describes itself in valid JSON-LD', async ({ page }) => {
    await page.goto('/');
    const [site, app] = await jsonLd(page);
    expect(site.inLanguage).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
    expect(site.potentialAction?.target).toMatch(
      /[^/]\/wardrobe\?keyword=\{search_term_string\}$/,
    );
    expect(app).not.toHaveProperty('browserRequirements');
    expect(app.codeRepository).toBe(SOURCE_URL);
  });

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('scrolls the screenshots by keyboard, not the page', async ({
      page,
    }) => {
      await page.goto('/');
      const shots = page.getByRole('region', { name: 'Screenshots' });
      await expect(shots.getByRole('img')).toHaveCount(4);
      await shots.focus();
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => shots.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('still reads, links and hides the copy button', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('main').getByRole('link', { name: 'Open wardrobe' }),
      ).toHaveAttribute('href', '/wardrobe');
      await expect(page.locator('main pre code')).toBeVisible();
      const copy = page.locator('main button[data-copy]');
      await expect(copy).toHaveCount(1);
      await expect(copy).toBeHidden();
    });
  });
});

test.describe('About', () => {
  test('names the fork, who maintains it and the original project', async ({
    page,
  }) => {
    await page.goto('/about');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { level: 1, name: 'About Libre Closet' }),
    ).toBeVisible();
    await expect(main).toContainText('This fork is maintained by mandatiq.');
    await expect(
      main.getByRole('link', { name: 'Source code' }),
    ).toHaveAttribute('href', SOURCE_URL);
    await expect(
      main.getByRole('link', { name: 'Original project' }),
    ).toHaveAttribute('href', 'https://github.com/Lazztech/Libre-Closet');
    const sizes = await headingSizes(page);
    expect(sizes.length).toBeGreaterThan(0);
    for (const { text, size } of sizes) {
      expect(size, text).toBeGreaterThanOrEqual(19);
    }
  });

  test('says who runs this instance only when that is configured', async ({
    page,
  }) => {
    await page.goto('/about');
    const heading = page.getByRole('heading', { name: 'This instance' });
    if (!OPERATOR_NAME && !OPERATOR_CONTACT) {
      await expect(heading).toHaveCount(0);
      return;
    }
    await expect(heading).toBeVisible();
    const terms = page.locator('main dl dt');
    const details = page.locator('main dl dd');
    await expect(terms).toHaveText(
      [OPERATOR_NAME && 'Run by', OPERATOR_CONTACT && 'Contact'].filter(
        Boolean,
      ),
    );
    await expect(details).toHaveText(
      [OPERATOR_NAME, OPERATOR_CONTACT].filter(Boolean),
    );
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });

    test('names its breadcrumb in the reader’s language', async ({ page }) => {
      await page.goto('/about');
      const [breadcrumb] = await jsonLd(page);
      expect(breadcrumb.itemListElement?.map((item) => item.name)).toEqual([
        'Startseite',
        'Über Libre Closet',
      ]);
    });
  });
});

for (const locale of ['de-DE', 'it-IT', 'ru-RU']) {
  test.describe(`in ${locale} at 320 px`, () => {
    test.use({ locale, viewport: { width: 320, height: 640 } });

    test('neither page scrolls sideways', async ({ page }) => {
      for (const path of ['/', '/about']) {
        await page.goto(path);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path,
        ).toBeLessThanOrEqual(320);
      }
    });
  });
}
