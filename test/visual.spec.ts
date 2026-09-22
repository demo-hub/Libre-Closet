import { test, expect } from '@playwright/test';
import { SEED_WEEK } from '../scripts/screenshots/seed';

const pages = [
  ['landing', '/'],
  ['wardrobe', '/wardrobe'],
  ['garment', '/wardrobe/1'],
  ['new-garment', '/wardrobe/new'],
  ['outfits', '/outfits'],
  ['outfit-builder', '/outfits/1/edit'],
  ['login', '/auth/login'],
  ['about', '/about'],
  ['calendar', `/calendar?week=${SEED_WEEK}`],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    for (const [name, path] of pages) {
      test(name, async ({ page }) => {
        await page.goto(path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${scheme}.png`);
      });
    }
  });
}
