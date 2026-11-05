import { readFileSync } from 'fs';
import { join } from 'path';
import type { I18nContext } from 'nestjs-i18n';
import { resolveCategoryLabel } from './category-label';
import { GarmentCategory } from './garment-category.enum';

const t = (key: string) => `translated ${key}`;
const i18n = { t } as unknown as I18nContext;

describe('resolveCategoryLabel', () => {
  it.each(['activewear', 'swimwear', 'underwear', 'lingerie', 'Swimwear'])(
    'translates %s',
    (value) => {
      expect(resolveCategoryLabel(value, i18n)).toBe(
        `translated lang.CATEGORY_${value.toUpperCase()}`,
      );
    },
  );

  it('shows a category the user typed as typed', () => {
    expect(resolveCategoryLabel('Knitwear', i18n)).toBe('Knitwear');
  });

  it.each(['de', 'en', 'es', 'fr', 'it', 'ru'])(
    'has every built-in category in %s',
    (locale) => {
      const lang = JSON.parse(
        readFileSync(join(__dirname, `../i18n/${locale}/lang.json`), 'utf8'),
      ) as Record<string, string>;
      for (const value of Object.values(GarmentCategory)) {
        expect(lang[`CATEGORY_${value.toUpperCase()}`]).toBeTruthy();
      }
    },
  );
});
