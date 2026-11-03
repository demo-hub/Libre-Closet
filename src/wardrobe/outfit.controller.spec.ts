import type { I18nContext } from 'nestjs-i18n';
import type { Garment } from '../dal/entity/garment.entity';
import { OutfitController } from './outfit.controller';

const labels: Record<string, string> = {
  tops: 'Oberteile',
  bottoms: 'Hosen',
  Knitwear: 'Knitwear',
};

describe('OutfitController category resolution', () => {
  const controller = new OutfitController(
    {} as never,
    {
      resolveCategoryLabel: (c: string) => labels[c] ?? c,
    } as never,
    {} as never,
  );
  const resolve = (typed: string) =>
    (
      controller as unknown as {
        resolveCategory(t: string, g: Garment[], i: I18nContext): string;
      }
    ).resolveCategory(
      typed,
      [{ category: 'tops' }, { category: 'Knitwear' }] as Garment[],
      {} as I18nContext,
    );

  const cases: [string, string][] = [
    ['tops', 'tops'],
    ['Tops', 'tops'],
    [' TOPS ', 'tops'],
    ['Oberteile', 'tops'],
    ['oberteile', 'tops'],
    ['hosen', 'bottoms'],
    ['knitwear', 'Knitwear'],
    ['Scarves', 'Scarves'],
  ];
  for (const [typed, stored] of cases) {
    it(`reads ${JSON.stringify(typed)} as ${JSON.stringify(stored)}`, () => {
      expect(resolve(typed)).toBe(stored);
    });
  }
});
