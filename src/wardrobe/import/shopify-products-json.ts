import { mapCategory } from './category-mapper';
import { mapColors } from './color-mapper';
import {
  cleanSourceUrl,
  emptyPrefill,
  GarmentPrefill,
  stripHtml,
  truncate,
} from './garment-prefill';
import type { ExtractOptions } from './product-draft';

/**
 * Shopify serves every product as JSON next to its page, and that payload names
 * the option axes outright. Worth one extra request: it is the difference
 * between guessing a colour out of a title and being told it.
 */
export function shopifyProductJsonUrl(pageUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return undefined;
  }
  // Handles /products/x, /collections/y/products/x and /en-gb/products/x alike.
  const match = /^(.*\/products\/[^/.?#]+)(?:\.[a-z]+)?$/i.exec(
    url.pathname.replace(/\/$/, ''),
  );
  if (!match) return undefined;
  return `${url.origin}${match[1]}.js`;
}

const OPTION_NAMES = {
  color: [
    'color',
    'colour',
    'couleur',
    'farbe',
    'colore',
    'color/colour',
    'colores',
    'цвет',
  ],
  size: [
    'size',
    'sizes',
    'taille',
    'grosse',
    'große',
    'grösse',
    'größe',
    'taglia',
    'talla',
    'размер',
  ],
} as const;

const fold = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const isAxis = (name: unknown, axis: keyof typeof OPTION_NAMES): boolean =>
  typeof name === 'string' &&
  OPTION_NAMES[axis].some((candidate) => fold(candidate) === fold(name));

interface ShopifyOption {
  name?: string;
  values?: unknown;
  position?: number;
}

interface ShopifyVariant {
  id?: number | string;
  title?: string;
  options?: unknown;
  option1?: string;
  option2?: string;
  option3?: string;
  available?: boolean;
  price?: number | string;
  featured_image?: unknown;
}

interface ShopifyProduct {
  title?: string;
  vendor?: string;
  type?: string;
  product_type?: string;
  tags?: unknown;
  description?: string;
  body_html?: string;
  price?: number | string;
  price_min?: number | string;
  options?: unknown;
  variants?: unknown;
  images?: unknown;
  featured_image?: unknown;
  url?: string;
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** Images are bare URLs in .js and objects with a src in .json. */
const imageSrc = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return text((value as Record<string, unknown>).src);
  }
  return undefined;
};

/** Protocol-relative CDN URLs are the norm here. */
const absolute = (candidate: string, base: string): string | undefined => {
  try {
    const url = new URL(candidate, base);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/** .js quotes prices in minor units, .json as a decimal string. */
const formatPrice = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return (value / 100).toFixed(2);
  }
  return text(value);
};

const variantOptionValues = (variant: ShopifyVariant): string[] => {
  const explicit = list(variant.options)
    .map(text)
    .filter((v): v is string => Boolean(v));
  if (explicit.length) return explicit;
  return [variant.option1, variant.option2, variant.option3]
    .map(text)
    .filter((v): v is string => Boolean(v));
};

/**
 * The variant the URL names, else the first that is in stock. `pinned` says the
 * shopper actually chose it, so a stale id cannot pass for a deliberate size.
 */
const selectVariant = (
  variants: ShopifyVariant[],
  pageUrl: string,
): { variant?: ShopifyVariant; pinned: boolean } => {
  let wanted: string | null = null;
  try {
    wanted = new URL(pageUrl).searchParams.get('variant');
  } catch {
    /* an unparseable URL simply names no variant */
  }
  if (wanted) {
    const found = variants.find((v) => String(v.id) === wanted);
    if (found) return { variant: found, pinned: true };
  }
  return {
    variant: variants.find((v) => v.available !== false) ?? variants[0],
    pinned: false,
  };
};

/**
 * Builds a draft from a Shopify product payload, or returns undefined when the
 * body is not one, so the caller can fall back to reading the page.
 */
export function parseShopifyProduct(
  body: unknown,
  pageUrl: string,
  { knownCategories = [], knownBrands = [] }: ExtractOptions = {},
): GarmentPrefill | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const wrapper = body as Record<string, unknown>;
  const raw = (
    wrapper.product && typeof wrapper.product === 'object'
      ? wrapper.product
      : wrapper
  ) as ShopifyProduct;
  if (!text(raw.title) || (!raw.variants && !raw.options)) return undefined;

  const draft = emptyPrefill();
  const options = list(raw.options).filter(
    (o): o is ShopifyOption => Boolean(o) && typeof o === 'object',
  );
  const variants = list(raw.variants).filter(
    (v): v is ShopifyVariant => Boolean(v) && typeof v === 'object',
  );
  const { variant: chosen, pinned } = selectVariant(variants, pageUrl);
  const chosenValues = chosen ? variantOptionValues(chosen) : [];
  const valueAt = (axis: keyof typeof OPTION_NAMES): string | undefined => {
    const index = options.findIndex((o) => isAxis(o.name, axis));
    return index === -1 ? undefined : text(chosenValues[index]);
  };

  draft.name = truncate(text(raw.title)!);
  draft.sources.name = 'shopify';
  applyBrand(draft, text(raw.vendor), knownBrands);
  applyColors(draft, valueAt('color'));
  applyCategory(draft, raw, knownCategories);
  applySize(draft, {
    offered: options.find((o) => isAxis(o.name, 'size'))?.values,
    chosen: valueAt('size'),
    variantCount: variants.length,
    pinned,
  });

  const description = text(raw.description) ?? text(raw.body_html);
  const price = formatPrice(chosen?.price ?? raw.price ?? raw.price_min);
  draft.notes =
    [
      description ? stripHtml(description) : undefined,
      price && `Price: ${price}`,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1000) || undefined;

  draft.imageCandidates = imageCandidates(raw, chosen, pageUrl);
  draft.sourceUrl = cleanSourceUrl(pageUrl);
  return draft;
}

/** Shops on Shopify sell their own label, so the vendor is the brand. */
const applyBrand = (
  draft: GarmentPrefill,
  vendor: string | undefined,
  knownBrands: string[],
) => {
  if (vendor) {
    draft.brand = truncate(vendor);
    draft.sources.brand = 'shopify';
    return;
  }
  const name = draft.name?.toLowerCase() ?? '';
  const found = knownBrands.find(
    (b) => b.length > 2 && name.includes(b.toLowerCase()),
  );
  if (found) {
    draft.brand = found;
    draft.sources.brand = 'heuristic';
  }
};

const applyColors = (draft: GarmentPrefill, stated: string | undefined) => {
  const mapped = stated
    ? mapColors(stated, { brand: draft.brand, explicit: true })
    : mapColors(draft.name ?? '', { brand: draft.brand });
  draft.colors = mapped.colors;
  draft.customColors = mapped.custom;
  if (draft.colors.length || draft.customColors.length) {
    draft.sources.colors = stated ? 'shopify' : 'heuristic';
  }
};

const applyCategory = (
  draft: GarmentPrefill,
  raw: ShopifyProduct,
  knownCategories: string[],
) => {
  const tags = list(raw.tags)
    .map(text)
    .filter((t): t is string => Boolean(t));
  const category = mapCategory(
    [text(raw.type) ?? text(raw.product_type), draft.name, ...tags]
      .filter(Boolean)
      .join(' '),
    knownCategories,
  );
  if (category) {
    draft.category = category;
    draft.sources.category = 'shopify';
  }
};

const applySize = (
  draft: GarmentPrefill,
  {
    offered,
    chosen,
    variantCount,
    pinned,
  }: {
    offered: unknown;
    chosen?: string;
    variantCount: number;
    pinned: boolean;
  },
) => {
  draft.sizeOptions = [
    ...new Set(
      list(offered)
        .map(text)
        .filter((v): v is string => Boolean(v)),
    ),
  ]
    .slice(0, 40)
    .map((size) => truncate(size, 64));
  if (!chosen) return;
  // A rail of sizes is offered, never chosen, unless the URL pins one variant.
  if (variantCount > 1 && pinned) {
    draft.size = truncate(chosen, 64);
    draft.sources.size = 'url';
  } else if (variantCount === 1) {
    draft.size = truncate(chosen, 64);
    draft.sources.size = 'shopify';
  }
};

const imageCandidates = (
  raw: ShopifyProduct,
  chosen: ShopifyVariant | undefined,
  pageUrl: string,
): string[] => {
  const seen = new Set<string>();
  for (const candidate of [
    imageSrc(chosen?.featured_image),
    imageSrc(raw.featured_image),
    ...list(raw.images).map(imageSrc),
  ]) {
    const resolved = candidate && absolute(candidate, pageUrl);
    if (resolved) seen.add(resolved);
  }
  return [...seen].slice(0, 5);
};
