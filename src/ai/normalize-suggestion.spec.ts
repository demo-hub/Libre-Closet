import type { EnrichmentContext } from './garment-enricher';
import { normalizeSuggestion } from './normalize-suggestion';

const context = (over: Partial<EnrichmentContext> = {}): EnrichmentContext => ({
  knownCategories: [],
  knownColors: [],
  language: 'en',
  ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  name: 'Wool Coat',
  category: 'outerwear',
  category_suggestion: '',
  colors: ['beige'],
  pattern: '',
  material: 'wool',
  brand: '',
  notes: '',
  confidence: { category: 0.9, colors: 0.8, brand: 0 },
  ...over,
});

describe('normalizeSuggestion', () => {
  it('keeps an answer that says what it was asked to say', () => {
    const result = normalizeSuggestion(answer(), context());
    expect(result).toMatchObject({
      name: 'Wool Coat',
      category: 'outerwear',
      colors: ['beige'],
      material: 'wool',
    });
  });

  describe('a provider that answers something else entirely', () => {
    it.each([
      ['nothing', undefined],
      ['a string', 'sorry, I cannot help with that'],
      ['a number', 42],
      ['an array', [1, 2, 3]],
      ['an empty object', {}],
    ])('refuses %s', (_label, raw) => {
      expect(normalizeSuggestion(raw, context())).toBeUndefined();
    });

    it('drops a colour that is not on the palette', () => {
      const result = normalizeSuggestion(
        answer({ colors: ['beige', 'chartreuse', 'blue'] }),
        context(),
      );
      expect(result?.colors).toEqual(['beige', 'blue']);
    });

    it('keeps at most three colours, however many it offers', () => {
      const result = normalizeSuggestion(
        answer({ colors: ['red', 'blue', 'green', 'black', 'white'] }),
        context(),
      );
      expect(result?.colors).toHaveLength(3);
    });

    it('drops a category that is neither built in nor the wardrobe own', () => {
      expect(
        normalizeSuggestion(answer({ category: 'outerwear-ish' }), context())
          ?.category,
      ).toBeUndefined();
    });

    it('refuses colours that are not even an array', () => {
      const result = normalizeSuggestion(
        answer({ colors: 'beige' }),
        context(),
      );
      expect(result?.colors).toEqual([]);
    });
  });

  describe('what the wardrobe already calls things', () => {
    it('prefers a category this wardrobe uses over a built-in one', () => {
      const result = normalizeSuggestion(
        answer({ category: '', category_suggestion: 'Coats' }),
        context({ knownCategories: ['Coats', 'Knitwear'] }),
      );
      expect(result?.category).toBe('Coats');
    });

    it('matches it however the model capitalised it', () => {
      const result = normalizeSuggestion(
        answer({ category: '', category_suggestion: 'KNITWEAR' }),
        context({ knownCategories: ['Knitwear'] }),
      );
      expect(result?.category).toBe('Knitwear');
    });
  });

  describe('what a suggestion is not allowed to carry', () => {
    it('strips markup out of every text field', () => {
      const result = normalizeSuggestion(
        answer({
          name: 'Coat <script>alert(1)</script>',
          notes: '<img src=x onerror=alert(1)> lovely',
        }),
        context(),
      );
      expect(result?.name).toBe('Coat alert(1)');
      expect(result?.notes).not.toContain('<');
    });

    it('strips links, which a suggestion has no business carrying', () => {
      const result = normalizeSuggestion(
        answer({ notes: 'See https://evil.example/steal for more' }),
        context(),
      );
      expect(result?.notes).toBe('See for more');
    });

    it('cuts a field to what its column holds', () => {
      const result = normalizeSuggestion(
        answer({ name: 'a'.repeat(400), notes: 'b'.repeat(4000) }),
        context(),
      );
      expect(result?.name?.length).toBeLessThanOrEqual(255);
      expect(result?.notes?.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('confidence', () => {
    it('clamps whatever number it was given into range', () => {
      const result = normalizeSuggestion(
        answer({ confidence: { category: 7, colors: -3, brand: 0.5 } }),
        context(),
      );
      expect(result?.confidence).toEqual({
        category: 1,
        colors: 0,
        brand: 0.5,
      });
    });

    it('reads a missing or nonsense confidence as none', () => {
      const result = normalizeSuggestion(
        answer({ confidence: { category: 'very', colors: null } }),
        context(),
      );
      expect(result?.confidence).toEqual({
        category: 0,
        colors: 0,
        brand: 0,
      });
    });

    it('throws away a brand it was not sure about', () => {
      // The one field a user is least likely to check and most likely to keep.
      const unsure = normalizeSuggestion(
        answer({
          brand: 'Nike',
          confidence: { category: 1, colors: 1, brand: 0.3 },
        }),
        context(),
      );
      expect(unsure?.brand).toBeUndefined();

      const sure = normalizeSuggestion(
        answer({
          brand: 'Nike',
          confidence: { category: 1, colors: 1, brand: 0.9 },
        }),
        context(),
      );
      expect(sure?.brand).toBe('Nike');
    });
  });

  it('says nothing when all it offered is a field the form cannot apply', () => {
    // A material with no name, category, colour or note renders as a heading
    // above an empty row of buttons, which reads as a broken feature.
    const result = normalizeSuggestion(
      answer({
        name: '',
        category: '',
        category_suggestion: '',
        colors: [],
        notes: '',
        brand: '',
        material: 'wool',
      }),
      context(),
    );
    expect(result).toBeUndefined();
  });

  it('never carries a size, which the vision schema does not ask for', () => {
    // A size read off a photo is a guess presented as a reading.
    const result = normalizeSuggestion(answer({ size: 'M' }), context());
    expect(result).not.toHaveProperty('size');
  });

  it('says nothing at all rather than an empty garment', () => {
    const result = normalizeSuggestion(
      answer({
        name: '',
        category: '',
        category_suggestion: '',
        colors: [],
        material: '',
        notes: '',
        brand: '',
      }),
      context(),
    );
    expect(result).toBeUndefined();
  });
});
