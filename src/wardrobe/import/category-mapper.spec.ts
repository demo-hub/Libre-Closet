import { GarmentCategory } from '../garment-category.enum';
import { mapCategory } from './category-mapper';

describe('mapCategory', () => {
  it.each([
    ['Oversized Cotton T-Shirt', GarmentCategory.TOPS],
    ['High-Waisted Wide-Leg Trousers', GarmentCategory.BOTTOMS],
    ['Midi Slip Dress', GarmentCategory.DRESSES],
    ['Quilted Puffer Jacket', GarmentCategory.OUTERWEAR],
    ['Air Force 1 Sneakers', GarmentCategory.FOOTWEAR],
    ['Leather Crossbody Bag', GarmentCategory.BAGS],
    ['Ribbed Wool Beanie', GarmentCategory.ACCESSORIES],
  ])('files %s', (text, expected) => {
    expect(mapCategory(text)).toBe(expected);
  });

  it.each([
    ['Camicia in lino', GarmentCategory.TOPS],
    ['Robe longue fleurie', GarmentCategory.DRESSES],
    ['Damen Jogginghose', GarmentCategory.BOTTOMS],
    ['Zapatillas de deporte', GarmentCategory.FOOTWEAR],
    ['Кожаная куртка', GarmentCategory.OUTERWEAR],
  ])('reads %s in the shop own language', (text, expected) => {
    expect(mapCategory(text)).toBe(expected);
  });

  describe('words that pull two ways', () => {
    it.each([
      ['Classic Dress Shirt', GarmentCategory.TOPS],
      ['Oxford Dress Shoes', GarmentCategory.FOOTWEAR],
      ['Tailored Dress Pants', GarmentCategory.BOTTOMS],
      ['Striped Shirt Dress', GarmentCategory.DRESSES],
      ['Top Handle Leather Bag', GarmentCategory.BAGS],
      ['Vintage Denim Jacket', GarmentCategory.OUTERWEAR],
    ])('files %s by the phrase, not the first word', (text, expected) => {
      expect(mapCategory(text)).toBe(expected);
    });

    it('files a bag before a top when both words appear', () => {
      expect(mapCategory('Top Handle Bag')).toBe(GarmentCategory.BAGS);
    });
  });

  it('ignores who the garment is for', () => {
    // "Men" must not match a known category called "Menswear" either.
    expect(mapCategory("Men's Running Shoes")).toBe(GarmentCategory.FOOTWEAR);
    expect(mapCategory('Damen Hemd')).toBe(GarmentCategory.TOPS);
  });

  describe('categories this wardrobe already uses', () => {
    it('prefers one over the built-in guess', () => {
      expect(mapCategory('Merino Knitwear Jumper', ['Knitwear'])).toBe(
        'Knitwear',
      );
    });

    it.each([
      ['Silk Blouse', ['Blouses'], 'Blouses'],
      ['Cashmere Hoodie', ['Hoodies'], 'Hoodies'],
      ['Silk Tie', ['Ties'], 'Ties'],
      ['Wool Scarf', ['Scarves'], 'Scarves'],
      ['Leather Boot', ['Boots'], 'Boots'],
    ])(
      'matches %s against the plural the wardrobe stores',
      (text, known, expected) => {
        expect(mapCategory(text, known)).toBe(expected);
      },
    );

    it('prefers the most specific of several matches', () => {
      expect(mapCategory('Wool Winter Coat', ['Coats', 'Winter Coats'])).toBe(
        'Winter Coats',
      );
    });

    it('matches whole words only', () => {
      expect(mapCategory('Topaz Ring', ['Top'])).toBe(
        GarmentCategory.ACCESSORIES,
      );
    });

    it('skips names too short to be meaningful', () => {
      expect(mapCategory('Ss Cotton Tee', ['Ss'])).toBe(GarmentCategory.TOPS);
    });
  });

  describe('a modifier is not the garment', () => {
    it.each([
      ['Tie-Dye Cotton T-Shirt', GarmentCategory.TOPS],
      ['Bow Tie Neck Blouse', GarmentCategory.TOPS],
      ['Cap Sleeve Midi Dress', GarmentCategory.DRESSES],
      ['Wool Trench Coat with Belt', GarmentCategory.OUTERWEAR],
      ['Belted Wool Coat', GarmentCategory.OUTERWEAR],
      ['Short Sleeve Cotton Polo Shirt', GarmentCategory.TOPS],
      ['Boot Cut Jeans', GarmentCategory.BOTTOMS],
      ['Oxford Cotton Button-Down Shirt', GarmentCategory.TOPS],
      ['Rock Band Graphic Tee', GarmentCategory.TOPS],
    ])('files %s by the garment, not the detail', (text, expected) => {
      expect(mapCategory(text)).toBe(expected);
    });

    it('still reads the word when it is the garment', () => {
      expect(mapCategory('Chelsea Boot')).toBe(GarmentCategory.FOOTWEAR);
      expect(mapCategory('Silk Tie')).toBe(GarmentCategory.ACCESSORIES);
      expect(mapCategory('Linen Shorts')).toBe(GarmentCategory.BOTTOMS);
      // German for skirt, French for a pair of shorts.
      expect(mapCategory('Rock aus Wolle')).toBe(GarmentCategory.BOTTOMS);
      expect(mapCategory('Short en lin')).toBe(GarmentCategory.BOTTOMS);
    });
  });

  it('reads the outerwear noun of every language it ships', () => {
    // 'man' inside 'manteau' used to leave " teau" behind.
    expect(mapCategory('Manteau en laine')).toBe(GarmentCategory.OUTERWEAR);
    expect(mapCategory('Mantel aus Wolle')).toBe(GarmentCategory.OUTERWEAR);
    expect(mapCategory('Damenmantel aus Wolle')).toBe(
      GarmentCategory.OUTERWEAR,
    );
    expect(mapCategory('Mantella in lana')).toBe(GarmentCategory.OUTERWEAR);
  });

  it('lets an exception phrase outrank a category the wardrobe uses', () => {
    // Every wardrobe has "dresses"; a dress shirt is still a top.
    expect(mapCategory('Classic Dress Shirt', ['dresses'])).toBe(
      GarmentCategory.TOPS,
    );
    expect(mapCategory('Top Handle Leather Bag', ['Tops'])).toBe(
      GarmentCategory.BAGS,
    );
  });

  it('leaves the field empty rather than guessing', () => {
    expect(mapCategory('Reference #18.1234')).toBeUndefined();
    expect(mapCategory('')).toBeUndefined();
  });

  it('is insensitive to case and accents', () => {
    expect(mapCategory('ÉCHARPE EN LAINE')).toBe(GarmentCategory.ACCESSORIES);
  });
});
