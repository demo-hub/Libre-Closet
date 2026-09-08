import { GarmentColor } from '../garment-color.enum';
import { mapColors } from './color-mapper';

describe('mapColors', () => {
  it.each([
    ['Black', [GarmentColor.BLACK]],
    ['Navy Blue', [GarmentColor.BLUE]],
    ['Charcoal Marl', [GarmentColor.GREY]],
    ['Bordeaux', [GarmentColor.RED]],
    ['Oatmeal', [GarmentColor.BEIGE]],
    ['Olive', [GarmentColor.GREEN]],
  ])('maps %s', (input, expected) => {
    expect(mapColors(input).colors).toEqual(expected);
  });

  it.each([
    ['nero', GarmentColor.BLACK],
    ['blanc cassé', GarmentColor.WHITE],
    ['dunkelblau', GarmentColor.BLUE],
    ['verde oliva', GarmentColor.GREEN],
    ['коричневый', GarmentColor.BROWN],
  ])('reads %s in the shop own language', (input, expected) => {
    expect(mapColors(input).colors).toContain(expected);
  });

  it('splits the shapes shops write two colours in', () => {
    expect(mapColors('White/Navy').colors).toEqual([
      GarmentColor.WHITE,
      GarmentColor.BLUE,
    ]);
    expect(mapColors('red and blue').colors).toEqual([
      GarmentColor.RED,
      GarmentColor.BLUE,
    ]);
    expect(mapColors('rosso e nero').colors).toEqual([
      GarmentColor.RED,
      GarmentColor.BLACK,
    ]);
  });

  it('keeps at most three, in the order the page states them', () => {
    const result = mapColors('red, blue, green, yellow, black');
    expect(result.colors).toEqual([
      GarmentColor.RED,
      GarmentColor.BLUE,
      GarmentColor.GREEN,
    ]);
  });

  it('prefers the longer phrase over the word inside it', () => {
    expect(mapColors('Light Blue').colors).toEqual([GarmentColor.BLUE]);
    expect(mapColors('Off-White', { explicit: true }).colors).toEqual([
      GarmentColor.WHITE,
    ]);
  });

  it('files a pattern as a pattern', () => {
    expect(mapColors('Leopard print').colors).toContain(GarmentColor.PATTERN);
    expect(mapColors('Striped Blue Shirt').colors).toEqual([
      GarmentColor.PATTERN,
      GarmentColor.BLUE,
    ]);
  });

  describe('brand names that read as colours', () => {
    it('does not file an Off-White hoodie as white', () => {
      const result = mapColors('Off-White Arrow Hoodie', {
        brand: 'Off-White',
      });
      expect(result.colors).toEqual([]);
    });

    it('drops the brand even when it is only in the built-in list', () => {
      expect(mapColors('Red Wing Iron Ranger').colors).toEqual([]);
    });

    it('still reads the colour the item actually is', () => {
      const result = mapColors('Black', { brand: 'Off-White' });
      expect(result.colors).toEqual([GarmentColor.BLACK]);
    });
  });

  describe('colours the palette has no place for', () => {
    it('keeps an unmatched word from a colour field, as the page spells it', () => {
      const result = mapColors('Nimbus Haze', { explicit: true });
      expect(result.custom).toEqual(['Nimbus Haze']);
    });

    it('does not mangle a Russian colour name it cannot map', () => {
      // Folding decomposes й; the user must not be shown "мокрыи".
      const result = mapColors('Мокрый асфальт', { explicit: true });
      expect(result.custom).toEqual(['Мокрый асфальт']);
    });

    it('never invents one from a product name', () => {
      // The whole reason the flag exists: "hoodie" is not a colour.
      const result = mapColors('Cropped Hoodie');
      expect(result.custom).toEqual([]);
      expect(result.colors).toEqual([]);
    });

    it('rejects tokens with digits or punctuation', () => {
      const result = mapColors('SKU-99321 / #ff00aa', { explicit: true });
      expect(result.custom).toEqual([]);
    });

    it('rejects a token too long to be a colour name', () => {
      const result = mapColors('a'.repeat(40), { explicit: true });
      expect(result.custom).toEqual([]);
    });
  });

  describe('two colour words in one phrase', () => {
    it('takes the head colour, which English puts last', () => {
      expect(mapColors('Rose Gold', { explicit: true }).colors).toEqual([
        GarmentColor.GOLD,
      ]);
      expect(mapColors('Steel Blue', { explicit: true }).colors).toEqual([
        GarmentColor.BLUE,
      ]);
    });

    it('still reads a modifier and its colour as one', () => {
      expect(mapColors('Light Blue').colors).toEqual([GarmentColor.BLUE]);
      expect(mapColors('Dark Olive Green').colors).toEqual([
        GarmentColor.GREEN,
      ]);
    });
  });

  it('splits a Russian colour field on its own conjunction', () => {
    expect(mapColors('красный и синий', { explicit: true }).colors).toEqual([
      GarmentColor.RED,
      GarmentColor.BLUE,
    ]);
  });

  it('does not read the English "or" as the French word for gold', () => {
    expect(mapColors('Rain or Shine Parka').colors).toEqual([]);
    expect(mapColors('Or', { explicit: true }).colors).toEqual([
      GarmentColor.GOLD,
    ]);
    expect(mapColors('Bleu et Or', { explicit: true }).colors).toEqual([
      GarmentColor.BLUE,
      GarmentColor.GOLD,
    ]);
  });

  it('sees through the invisible characters a page hides a brand behind', () => {
    const result = mapColors('Off\u00adWhite Arrow Hoodie', {
      brand: 'Off-White',
    });
    expect(result.colors).toEqual([]);
  });

  it('does not call a multi-pocket jacket patterned', () => {
    expect(mapColors('Multi Pocket Utility Jacket').colors).toEqual([]);
    expect(mapColors('Multi Colour Knit').colors).toEqual([
      GarmentColor.PATTERN,
    ]);
  });

  it('matches whole words only', () => {
    expect(mapColors('Redwood Bench').colors).toEqual([]);
    expect(mapColors('Blackberry Farm').colors).toEqual([]);
  });

  it('returns nothing for empty text', () => {
    expect(mapColors('')).toEqual({ colors: [], custom: [] });
  });
});
