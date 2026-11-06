import * as fs from 'node:fs';
import * as path from 'node:path';
import { colorLabel, colorLabels } from './color-label';
import { GarmentColor } from './garment-color.enum';

const translate = (key: string) => `[${key}]`;

describe('colorLabel', () => {
  it('translates a known colour', () => {
    expect(colorLabel('red', translate)).toBe('[lang.COLOR_RED]');
  });

  it('knows a colour in any case, as the filter does', () => {
    expect(colorLabel('RED', translate)).toBe('[lang.COLOR_RED]');
  });

  it('shows a custom colour as typed, without asking the translator', () => {
    const asked = jest.fn(translate);
    expect(colorLabel('Teal $t(lang.SAVE)', asked)).toBe('Teal $t(lang.SAVE)');
    expect(asked).not.toHaveBeenCalled();
  });

  it.each(['de', 'en', 'es', 'fr', 'it', 'ru'])(
    '%s has a name for every known colour',
    (locale) => {
      const lang = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, '..', 'i18n', locale, 'lang.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      for (const color of Object.values(GarmentColor)) {
        expect(lang[`COLOR_${color.toUpperCase()}`]).toEqual(
          expect.stringMatching(/\S/),
        );
      }
    },
  );
});

describe('colorLabels', () => {
  it('reads a stored list as one line', () => {
    expect(colorLabels('red, navy,beige', translate)).toBe(
      '[lang.COLOR_RED], navy, [lang.COLOR_BEIGE]',
    );
  });

  it('is empty without colours', () => {
    expect(colorLabels(undefined, translate)).toBe('');
    expect(colorLabels('', translate)).toBe('');
  });
});
