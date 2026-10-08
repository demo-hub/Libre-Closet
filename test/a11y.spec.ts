import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

/** axe on every page a self-hoster uses, in light and dark (docs/REDESIGN.md 7). Expects AUTH_ENABLED=false. */

type Made = { garment: string; outfit: string };

const test = base.extend<object, { made: Made }>({
  made: [
    async ({ playwright }, use, workerInfo) => {
      const request = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      const name = `Axe ${workerInfo.project.name} ${Date.now()}`;
      const garment = await request.post('/wardrobe', {
        form: { name, category: 'tops', color: 'blue' },
      });
      expect(garment.ok()).toBeTruthy();
      const garmentPath = new URL(garment.url()).pathname;
      const outfit = await request.post('/outfits', {
        form: {
          name,
          category: 'tops',
          garmentId: garmentPath.split('/').pop()!,
          // Today, so the current week on /calendar has an entry.
          scheduleDate: new Date().toISOString().slice(0, 10),
        },
      });
      expect(outfit.ok()).toBeTruthy();
      const outfitPath = new URL(outfit.url()).pathname;

      await use({ garment: garmentPath, outfit: outfitPath });

      await request.delete(outfitPath);
      await request.delete(garmentPath);
      await request.dispose();
    },
    { scope: 'worker' },
  ],
});

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Route = {
  name: string;
  path: (made: Made) => string;
  open?: (page: Page) => Promise<void>;
};

const at = (path: string): Route => ({ name: path, path: () => path });

const routes: Route[] = [
  at('/'),
  at('/wardrobe'),
  {
    name: '/wardrobe with the filter sheet open',
    path: () => '/wardrobe',
    open: async (page) => {
      await page.locator('#filter-button').click();
      await expect(page.locator('#filter-close')).toBeFocused();
    },
  },
  at('/wardrobe/new'),
  {
    name: '/wardrobe/new with the colour list open',
    path: () => '/wardrobe/new',
    open: async (page) => {
      const list = page.locator('.color-ms').first();
      await list.locator('summary').click();
      await expect(list.locator('.ms-dropdown')).toBeVisible();
      // On fine pointers the search box takes focus 10 ms later and scrolls the page; axe's
      // target-size then counts a control half under the sticky header as covered.
      if (await page.evaluate(() => matchMedia('(pointer: fine)').matches)) {
        await expect(list.locator('.ms-search-input')).toBeFocused();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  { name: '/wardrobe/:id', path: (made) => made.garment },
  at('/outfits'),
  at('/outfits/new'),
  { name: '/outfits/:id', path: (made) => made.outfit },
  at('/calendar'),
  at('/auth/login'),
  at('/auth/register'),
  at('/auth/reset'),
  at('/about'),
  at('/privacy'),
  at('/terms'),
  at('/offline.html'),
];

async function visit(page: Page, route: Route, made: Made) {
  await page.goto(route.path(made));
  await route.open?.(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const route of routes) {
      test(`${route.name} passes axe`, async ({ page, made }) => {
        await visit(page, route, made);
        const { violations } = await new AxeBuilder({ page })
          .withTags([
            'wcag2a',
            'wcag2aa',
            'wcag21aa',
            'wcag22aa',
            'best-practice',
          ])
          .analyze();
        expect(
          violations.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
          ),
        ).toEqual([]);
      });
    }
  });
}

for (const route of routes) {
  test(`${route.name} holds still under reduced motion`, async ({
    page,
    made,
  }) => {
    await visit(page, route, made);
    const moving = await page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const style = getComputedStyle(el, pseudo);
          if (style.animationName === 'none') continue;
          // In seconds; the reduced-motion block in main.css sets 0.01 ms.
          const longest = Math.max(
            ...style.animationDuration.split(',').map((d) => parseFloat(d)),
          );
          if (Math.round(longest * 1e6) > 10) {
            found.push(
              `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${pseudo ?? ''}: ${style.animationName} ${style.animationDuration}`,
            );
          }
        }
      }
      return found;
    });
    expect(moving).toEqual([]);
  });
}

for (const path of ['/wardrobe', '/calendar']) {
  test(`every stop on ${path} shows a solid ring of at least 2 px`, async ({
    page,
    made,
  }) => {
    await visit(page, at(path), made);
    const unringed: string[] = [];
    let stops = 0;
    for (; stops < 300; stops++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(async () => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.dataset.ringChecked) return null;
        el.dataset.ringChecked = 'true';
        // Under reduced motion every property still has a 0.01 ms transition to finish.
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        const style = getComputedStyle(el);
        return {
          name: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`,
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          solid: style.outlineStyle === 'solid',
          width: parseFloat(style.outlineWidth),
        };
      });
      if (!stop) break;
      if (!stop.solid || stop.width < 2) {
        unringed.push(`${stop.name}: ${stop.outline}`);
      }
    }
    expect(stops).toBeGreaterThan(3);
    expect(unringed).toEqual([]);
  });
}
