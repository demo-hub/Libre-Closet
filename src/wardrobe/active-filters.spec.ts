import type { SearchGarmentDto } from './dto/search-garment.dto';
import {
  activeFilters,
  filterState,
  normalizeSearch,
  single,
  wardrobeHref,
} from './active-filters';

const names = {
  category: 'Category',
  color: 'Colour',
  size: 'Size',
  showArchived: 'Show archived',
};
const label = (value: string) => `label:${value}`;
const query = (q: Record<string, unknown>) => q as SearchGarmentDto;

describe('single', () => {
  it('keeps a non-empty string and drops anything else', () => {
    expect(single('tops')).toBe('tops');
    expect(single('')).toBeUndefined();
    expect(single(undefined)).toBeUndefined();
    expect(single(['tops', 'bags'])).toBeUndefined();
  });
});

describe('wardrobeHref', () => {
  it('is the bare wardrobe when nothing is set', () => {
    expect(wardrobeHref(query({}), null)).toBe('/wardrobe');
  });

  it('keeps the shared wardrobe being viewed', () => {
    expect(wardrobeHref(query({ color: 'red' }), 9, ['color'])).toBe(
      '/wardrobe?ownerId=9',
    );
  });

  it('encodes values that would otherwise end or split the query', () => {
    const href = wardrobeHref(
      query({ keyword: 'a&b #1', size: 'S+', color: 'red' }),
      null,
      ['color'],
    );
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('keyword')).toBe('a&b #1');
    expect(params.get('size')).toBe('S+');
    expect(params.has('color')).toBe(false);
  });

  it('keeps archived only when it is the literal "true"', () => {
    expect(wardrobeHref(query({ archived: 'true' }), null)).toBe(
      '/wardrobe?archived=true',
    );
    expect(wardrobeHref(query({ archived: 'false' }), null)).toBe('/wardrobe');
  });

  it('leaves out repeated parameters instead of joining them', () => {
    expect(wardrobeHref(query({ category: ['tops', 'bags'] }), null)).toBe(
      '/wardrobe',
    );
  });
});

describe('activeFilters', () => {
  it('has no pill for the keyword, which stays in the search field', () => {
    expect(
      activeFilters(query({ keyword: 'coat' }), null, names, label),
    ).toEqual([]);
  });

  it('names each facet and resolves the category label', () => {
    const pills = activeFilters(
      query({ category: 'tops', color: 'red', size: 'M' }),
      null,
      names,
      label,
    );
    expect(pills.map((p) => [p.facet, p.value, p.capitalize])).toEqual([
      ['Category', 'label:tops', false],
      ['Colour', 'red', true],
      ['Size', 'M', false],
    ]);
  });

  it('removes one filter and keeps the others, the keyword, archived and the owner', () => {
    const pills = activeFilters(
      query({
        keyword: 'a&b',
        category: 'tops',
        color: 'red',
        size: 'M',
        archived: 'true',
      }),
      9,
      names,
      label,
    );
    const colour = new URL(pills[1].href, 'http://x').searchParams;
    expect(Object.fromEntries(colour)).toEqual({
      keyword: 'a&b',
      category: 'tops',
      size: 'M',
      archived: 'true',
      ownerId: '9',
    });
  });

  it('shows archived as its own switch, with no facet name', () => {
    const [pill] = activeFilters(
      query({ archived: 'true', color: 'red' }),
      null,
      names,
      label,
    ).slice(-1);
    expect(pill).toEqual({
      facet: null,
      value: 'Show archived',
      capitalize: false,
      href: '/wardrobe?color=red',
    });
  });

  it('ignores a repeated category rather than resolving an array', () => {
    const resolved: string[] = [];
    const pills = activeFilters(
      query({ category: ['tops', 'bags'] }),
      null,
      names,
      (value) => {
        resolved.push(value);
        return value;
      },
    );
    expect(pills).toEqual([]);
    expect(resolved).toEqual([]);
  });
});

describe('filterState', () => {
  it('clears the facets and archived but keeps the keyword and the owner', () => {
    expect(
      filterState(query({ keyword: 'coat', size: 'M', archived: 'true' }), 9, 0)
        .clearFiltersHref,
    ).toBe('/wardrobe?keyword=coat&ownerId=9');
  });

  it('offers no clearing when only a keyword is set', () => {
    expect(filterState(query({ keyword: 'coat' }), null, 0)).toEqual({
      filtered: true,
      emptyWardrobe: false,
      showArchived: false,
      clearFiltersHref: null,
    });
  });

  it('calls a list empty only when nothing narrows it', () => {
    expect(filterState(query({}), null, 0).emptyWardrobe).toBe(true);
    expect(
      filterState(query({ archived: 'true' }), null, 0).emptyWardrobe,
    ).toBe(true);
    expect(filterState(query({ color: 'red' }), null, 0).emptyWardrobe).toBe(
      false,
    );
    expect(filterState(query({}), null, 3).emptyWardrobe).toBe(false);
  });
});

describe('normalizeSearch', () => {
  it('drops repeated and empty parameters and any archived value but "true"', () => {
    expect(
      normalizeSearch(
        query({
          keyword: '',
          category: ['tops', 'bags'],
          color: 'red',
          size: ['S', 'M'],
          archived: 'TRUE',
        }),
      ),
    ).toEqual({
      keyword: undefined,
      category: undefined,
      color: 'red',
      brand: undefined,
      size: undefined,
      archived: undefined,
    });
    expect(normalizeSearch(query({ archived: 'true' })).archived).toBe('true');
  });
});
