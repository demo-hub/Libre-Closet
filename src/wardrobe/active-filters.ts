import type { SearchGarmentDto } from './dto/search-garment.dto';
import type { GarmentColor } from './garment-color.enum';

const PARAMS = ['keyword', 'category', 'color', 'size', 'archived'] as const;
type Param = (typeof PARAMS)[number];

export interface ActiveFilter {
  /** The facet's name, or null for the archived switch, which names itself. */
  facet: string | null;
  value: string;
  /** Colour values are lowercase enum names, so only they are capitalised. */
  capitalize: boolean;
  href: string;
}

export interface FacetNames {
  category: string;
  color: string;
  size: string;
  showArchived: string;
}

/** A query value, or undefined when it is missing, empty or repeated (an array). */
export function single(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** `archived=true` adds archived garments to the list; any other value is ignored. */
export function showsArchived(query: SearchGarmentDto): boolean {
  return query.archived === 'true';
}

/** The query as the page shows it: a repeated or empty parameter is dropped, so the list, the pills and the form agree. */
export function normalizeSearch(query: SearchGarmentDto): SearchGarmentDto {
  return {
    keyword: single(query.keyword),
    category: single(query.category),
    color: single(query.color) as GarmentColor | undefined,
    brand: single(query.brand),
    size: single(query.size),
    archived: showsArchived(query) ? 'true' : undefined,
  };
}

/** The wardrobe view with the same query, minus the dropped parameters. */
export function wardrobeHref(
  query: SearchGarmentDto,
  ownerId: number | null,
  drop: Param[] = [],
): string {
  const params = new URLSearchParams();
  for (const param of PARAMS) {
    const value = single(query[param]);
    if (!value || drop.includes(param)) continue;
    if (param === 'archived' && !showsArchived(query)) continue;
    params.set(param, value);
  }
  if (ownerId != null) params.set('ownerId', String(ownerId));
  const search = params.toString();
  return search ? `/wardrobe?${search}` : '/wardrobe';
}

export interface FilterState {
  /** A keyword or a facet narrows the list; archived only widens it. */
  filtered: boolean;
  emptyWardrobe: boolean;
  showArchived: boolean;
  /** Keeps the keyword, which the search field still shows; null when no facet is set. */
  clearFiltersHref: string | null;
}

export function filterState(
  query: SearchGarmentDto,
  ownerId: number | null,
  count: number,
): FilterState {
  const facet = [query.category, query.color, query.size].some((value) =>
    single(value),
  );
  const filtered = facet || !!single(query.keyword);
  return {
    filtered,
    emptyWardrobe: count === 0 && !filtered,
    showArchived: showsArchived(query),
    clearFiltersHref: facet
      ? wardrobeHref(query, ownerId, ['category', 'color', 'size', 'archived'])
      : null,
  };
}

/** One removable pill per filter in the query; the keyword stays in the search field. */
export function activeFilters(
  query: SearchGarmentDto,
  ownerId: number | null,
  names: FacetNames,
  categoryLabel: (value: string) => string,
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  const category = single(query.category);
  if (category) {
    filters.push({
      facet: names.category,
      value: categoryLabel(category),
      capitalize: false,
      href: wardrobeHref(query, ownerId, ['category']),
    });
  }
  const color = single(query.color);
  if (color) {
    filters.push({
      facet: names.color,
      value: color,
      capitalize: true,
      href: wardrobeHref(query, ownerId, ['color']),
    });
  }
  const size = single(query.size);
  if (size) {
    filters.push({
      facet: names.size,
      value: size,
      capitalize: false,
      href: wardrobeHref(query, ownerId, ['size']),
    });
  }
  if (showsArchived(query)) {
    filters.push({
      facet: null,
      value: names.showArchived,
      capitalize: false,
      href: wardrobeHref(query, ownerId, ['archived']),
    });
  }
  return filters;
}
