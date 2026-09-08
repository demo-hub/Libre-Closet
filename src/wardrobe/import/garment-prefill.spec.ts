import { cleanSourceUrl, emptyPrefill, truncate } from './garment-prefill';

describe('truncate', () => {
  it('leaves a value the column can hold', () => {
    expect(truncate('Wool Coat')).toBe('Wool Coat');
  });

  it('cuts to the column width without a trailing space', () => {
    const result = truncate(`${'a'.repeat(254)} ${'b'.repeat(20)}`);
    expect(result).toHaveLength(254);
    expect(result.endsWith(' ')).toBe(false);
  });

  it('takes a narrower limit for the narrower columns', () => {
    expect(truncate('XXXXL', 3)).toBe('XXX');
  });
});

describe('cleanSourceUrl', () => {
  it('drops campaign parameters and the fragment', () => {
    expect(
      cleanSourceUrl(
        'https://shop.example/p/1?utm_source=mail&utm_medium=e&fbclid=x&color=navy#reviews',
      ),
    ).toBe('https://shop.example/p/1?color=navy');
  });

  it('keeps the parameters that identify the product', () => {
    const url = 'https://shop.example/p/1?variant=42&size=M';
    expect(cleanSourceUrl(url)).toBe(url);
  });

  it('hands back anything it cannot parse, for the user to fix', () => {
    expect(cleanSourceUrl('shop.example/p/1')).toBe('shop.example/p/1');
  });
});

describe('emptyPrefill', () => {
  it('starts with lists, not undefined, so the form can render it', () => {
    expect(emptyPrefill()).toEqual({
      colors: [],
      customColors: [],
      sizeOptions: [],
      imageCandidates: [],
      sources: {},
    });
  });
});
