import { mapCategory } from './category-mapper';
import { mapColors } from './color-mapper';
import {
  cleanSourceUrl,
  emptyPrefill,
  GarmentPrefill,
  PrefillSource,
  stripHtml,
  truncate,
} from './garment-prefill';
import {
  collectJsonLd,
  collectJsonLdNodes,
  hasType,
  JsonLdNode,
  PageMetadata,
  readPageMetadata,
} from './page-metadata';

/** Hosts that sell other people's brands, so their own name is never the brand. */
const MARKETPLACES = [
  'vinted',
  'depop',
  'ebay',
  'grailed',
  'vestiairecollective',
  'poshmark',
  'mercari',
  'etsy',
  'amazon',
  'zalando',
  'asos',
  'farfetch',
  'ssense',
  'yoox',
  'net-a-porter',
  'mytheresa',
  'endclothing',
  'aboutyou',
  'nordstrom',
  'macys',
  'otto',
  'laredoute',
  'therealreal',
  'kleinanzeigen',
  'leboncoin',
  'wallapop',
  'avito',
  'shopgoodwill',
];

const str = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
};

/** The depth cap collectJsonLd uses: an attacker chooses how deep their JSON nests. */
const MAX_DEPTH = 8;

/** schema.org fields are routinely a string, an object with a name, or a list. */
const named = (value: unknown, depth = 0): string | undefined => {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) return named(value[0], depth + 1);
  const direct = str(value);
  if (direct) return direct;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return str(record.name) ?? str(record.value);
  }
  return undefined;
};

/** image is a URL, an ImageObject, or an array of either. */
const imageUrls = (value: unknown, depth = 0): string[] => {
  if (!value || depth > MAX_DEPTH) return [];
  if (Array.isArray(value))
    return value.flatMap((v) => imageUrls(v, depth + 1));
  const direct = str(value);
  if (direct) return [direct];
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return imageUrls(record.url ?? record.contentUrl, depth + 1);
  }
  return [];
};

const absolute = (candidate: string, base: string): string | undefined => {
  try {
    const url = new URL(candidate, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Strips the site's own branding from a page title: "Product | Shop",
 * "Product - Shop", "Product. Nike.com".
 */
export function cleanName(
  rawName: string,
  {
    siteName,
    brand,
    host,
  }: { siteName?: string; brand?: string; host?: string },
): string {
  let name = rawName.replace(/\s+/g, ' ').trim();
  const suffixes = [siteName, brand, host, host?.replace(/^www\./, '')]
    .filter((s): s is string => Boolean(s && s.length > 1))
    .concat(['Official Store', 'Online Shop', 'Shop Online']);

  for (let pass = 0; pass < 3; pass++) {
    const before = name;
    for (const suffix of suffixes) {
      // A suffix longer than the name cannot match, and a page-supplied one is
      // long enough to make V8 refuse to compile the pattern at all.
      if (suffix.length > name.length) continue;
      const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      name = name
        .replace(new RegExp(`\\s*[|\\-–—·•:]\\s*${escaped}\\s*$`, 'i'), '')
        .replace(new RegExp(`\\s*\\.\\s*${escaped}\\s*$`, 'i'), '');
    }
    if (name === before) break;
  }
  return name.trim();
}

/** Nike-style tails: "Shoes - White/White - Size 5". */
const stripVariantTail = (name: string, color?: string, size?: string) => {
  // Collapsed first, like cleanName does: `\s*` in the patterns below walks a
  // long whitespace run back one character at a time from every position.
  let out = name.replace(/\s+/g, ' ');
  for (const part of [color, size]) {
    if (!part || part.length > out.length) continue;
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\s*[-–—]\\s*(size\\s*)?${escaped}\\s*$`, 'i'), '')
      .replace(
        new RegExp(`\\s*[-–—]\\s*(size\\s*)?${escaped}\\s*(?=[-–—])`, 'i'),
        '',
      );
  }
  return out.trim();
};

interface ProductNode {
  node: Record<string, unknown>;
  isGroup: boolean;
  /** Reached through a list of other products: a recommendation, not this page. */
  listed: boolean;
}

const productNodes = (blocks: unknown[]): ProductNode[] =>
  collectJsonLd(blocks)
    .filter((entry: JsonLdNode) =>
      hasType(
        entry.node,
        'product',
        'productgroup',
        'individualproduct',
        'productmodel',
      ),
    )
    .map(({ node, listed }) => ({
      node,
      listed,
      isGroup: hasType(node, 'productgroup'),
    }));

/** True when the variant's own URL is the page, query parameters included. */
const urlMatchesPage = (raw: string, pageUrl: string): boolean => {
  try {
    const page = new URL(pageUrl);
    const variant = new URL(raw, pageUrl);
    if (variant.origin !== page.origin || variant.pathname !== page.pathname) {
      return false;
    }
    return [...variant.searchParams].every(
      ([key, value]) => page.searchParams.get(key) === value,
    );
  } catch {
    return false;
  }
};

/**
 * Picks the variant the URL is actually showing. Shops put the sku or colour in
 * the path or query; without one the first variant is as good a guess as any,
 * and group-level fields fill the rest in.
 */
const selectVariant = (
  nodes: ProductNode[],
  pageUrl: string,
): { variant?: Record<string, unknown>; group?: Record<string, unknown> } => {
  // A "you may also like" rail is JSON-LD too. Its products only count when the
  // page offers nothing else.
  const own = nodes.filter((n) => !n.listed);
  const pool = own.length ? own : nodes;
  const variants = pool.filter((n) => !n.isGroup).map((n) => n.node);
  if (!variants.length) {
    const group = pool.find((n) => n.isGroup)?.node;
    return { group, variant: group };
  }

  const haystack = pageUrl.toLowerCase();
  const matched = variants.find((v) => {
    const keys = [v.sku, v.gtin, v.gtin13, v.mpn, v.productID]
      .map(str)
      .filter((k): k is string => Boolean(k && k.length > 2));
    if (keys.some((k) => haystack.includes(k.toLowerCase()))) return true;
    const url = str(v.url);
    return Boolean(url && urlMatchesPage(url, pageUrl));
  });
  const variant = matched ?? variants[0];
  return { group: groupOf(variant, pool), variant };
};

/** The group this variant belongs to, rather than whichever one came first. */
const groupOf = (
  variant: Record<string, unknown>,
  nodes: ProductNode[],
): Record<string, unknown> | undefined => {
  const groups = nodes.filter((n) => n.isGroup);
  const owner = groups.find((g) => {
    const listed = g.node.hasVariant;
    return Array.isArray(listed) && listed.includes(variant);
  });
  if (owner) return owner.node;
  const byRef = groups.find((g) => g.node === variant.isVariantOf);
  if (byRef) return byRef.node;
  // Some shops emit the group beside its variants instead of around them. One
  // group and a plausible relation is enough; a second product's group is not.
  const only = groups.length === 1 ? groups[0].node : undefined;
  return only && related(variant, only) ? only : undefined;
};

const related = (
  variant: Record<string, unknown>,
  group: Record<string, unknown>,
): boolean => {
  if (variant === group || 'isVariantOf' in variant) return true;
  const child = str(variant.name)?.toLowerCase();
  const parent = str(group.name)?.toLowerCase();
  if (!child || !parent) return true;
  return child.includes(parent) || parent.includes(child);
};

/**
 * A wall, not a product page. Worth naming: prefilling a garment called "Just a
 * moment..." is worse than telling the user the shop refused us.
 */
const CHALLENGE_TITLES = [
  'just a moment',
  'access denied',
  'access to this page has been denied',
  'attention required',
  'security check',
  'checking your browser',
  'are you a robot',
  'bot verification',
  'human verification',
  'pardon our interruption',
  'please enable javascript',
  'one more step',
  'request unsuccessful',
  'error 1020',
  '403 forbidden',
  'zugriff verweigert',
  'acceso denegado',
  'accesso negato',
  'accès refusé',
  'доступ запрещен',
];

const CHALLENGE_REDIRECTS =
  /bm-verify|distil|incapsula|_sec\/verify|__cf_chl|px-captcha|geo\.captcha/i;

export function looksBlocked(meta: PageMetadata): boolean {
  const title = (meta.title ?? '').toLowerCase();
  if (title && CHALLENGE_TITLES.some((phrase) => title.includes(phrase))) {
    return true;
  }
  return CHALLENGE_REDIRECTS.test(meta.meta.refresh ?? '');
}

export interface ExtractOptions {
  /** Categories this wardrobe already uses; preferred over a built-in guess. */
  knownCategories?: string[];
  /** Brands this wardrobe already uses, matched in marketplace titles. */
  knownBrands?: string[];
}

/**
 * Turns a fetched product page into a draft for the user to review. Everything
 * is a suggestion: nothing here is trusted enough to save without being seen.
 */
export function extractProduct(
  html: string,
  pageUrl: string,
  options: ExtractOptions = {},
): GarmentPrefill {
  const meta = readPageMetadata(html);
  return buildDraft(meta, pageUrl, options);
}

interface Context {
  meta: PageMetadata;
  pageUrl: string;
  host?: string;
  field: (key: string) => unknown;
  variantColor?: string;
  variantSize?: string;
  group?: Record<string, unknown>;
  options: ExtractOptions;
}

export function buildDraft(
  meta: PageMetadata,
  pageUrl: string,
  options: ExtractOptions = {},
): GarmentPrefill {
  const draft = emptyPrefill();
  const host = safeHost(pageUrl);
  if (looksBlocked(meta)) {
    draft.sourceUrl = cleanSourceUrl(pageUrl);
    return draft;
  }
  const { variant, group } = selectVariant(productNodes(meta.jsonLd), pageUrl);
  const context: Context = {
    meta,
    pageUrl,
    host,
    group,
    options,
    field: (key) => variant?.[key] ?? group?.[key] ?? undefined,
    variantColor: named(variant?.color ?? group?.color),
    variantSize: named(variant?.size ?? group?.size),
  };

  // Brand first: the name cleaner and the colour mapper both need it.
  applyBrand(draft, context);
  applyName(draft, context);
  applyKnownBrand(draft, options.knownBrands ?? []);
  applyColors(draft, context);
  applyCategory(draft, context);
  applySize(draft, context);
  applyNotes(draft, context);

  draft.imageCandidates = imageCandidates(meta, variant, group, pageUrl);
  const canonicalUrl = canonical(meta, pageUrl, host);
  draft.sourceUrl = cleanSourceUrl(canonicalUrl ?? pageUrl);
  draft.sources.sourceUrl = canonicalUrl ? 'opengraph' : 'url';
  return draft;
}

const applyBrand = (draft: GarmentPrefill, { field, meta, host }: Context) => {
  // By domain label, not substring: "otto" is inside "ottolinger.com".
  const marketplace = (host ?? '')
    .split('.')
    .some((label) =>
      MARKETPLACES.some((m) => label === m || label.split('-').includes(m)),
    );
  const stated =
    named(field('brand')) ??
    named(field('manufacturer')) ??
    meta.meta['product:brand'];
  if (stated) {
    draft.brand = truncate(stated);
    draft.sources.brand = 'jsonld';
  } else if (!marketplace && meta.meta['og:site_name']) {
    draft.brand = truncate(meta.meta['og:site_name']);
    draft.sources.brand = 'opengraph';
  }
};

const applyName = (
  draft: GarmentPrefill,
  { field, meta, host, variantColor, variantSize }: Context,
) => {
  const candidates: [string | undefined, PrefillSource][] = [
    [named(field('name')), 'jsonld'],
    [meta.meta['og:title'], 'opengraph'],
    [meta.meta['twitter:title'], 'opengraph'],
    [meta.title, 'title'],
    [meta.h1, 'title'],
  ];
  const picked = candidates.find(([value]) => value);
  if (!picked?.[0]) return;
  const cleaned = cleanName(
    stripVariantTail(picked[0], variantColor, variantSize),
    { siteName: meta.meta['og:site_name'], brand: draft.brand, host },
  );
  if (cleaned) {
    draft.name = truncate(cleaned);
    draft.sources.name = picked[1];
  }
};

/** On a marketplace the seller's brand is usually only in the title. */
const applyKnownBrand = (draft: GarmentPrefill, knownBrands: string[]) => {
  if (draft.brand || !draft.name) return;
  const name = draft.name.toLowerCase();
  const found = knownBrands.find(
    (b) => b.length > 2 && name.includes(b.toLowerCase()),
  );
  if (found) {
    draft.brand = found;
    draft.sources.brand = 'heuristic';
  }
};

const applyColors = (
  draft: GarmentPrefill,
  { meta, variantColor }: Context,
) => {
  const stated = variantColor ?? meta.meta['product:color'];
  const mapped = stated
    ? mapColors(stated, { brand: draft.brand, explicit: true })
    : mapColors(draft.name ?? '', { brand: draft.brand });
  draft.colors = mapped.colors;
  draft.customColors = mapped.custom;
  if (draft.colors.length || draft.customColors.length) {
    draft.sources.colors = variantColor
      ? 'jsonld'
      : stated
        ? 'opengraph'
        : 'heuristic';
  }
};

const applyCategory = (
  draft: GarmentPrefill,
  { field, meta, pageUrl, options }: Context,
) => {
  // A chain, not a blob: an explicit category outranks a word in the title,
  // and joining them would let the keyword order decide instead.
  const candidates: [string | undefined, PrefillSource][] = [
    [named(field('category')), 'jsonld'],
    [breadcrumbTrail(meta.jsonLd), 'jsonld'],
    [meta.meta['product:category'], 'opengraph'],
    [draft.name, draft.sources.name ?? 'title'],
    [pathWords(pageUrl), 'url'],
  ];
  for (const [text, source] of candidates) {
    const category = text
      ? mapCategory(text, options.knownCategories ?? [])
      : undefined;
    if (category) {
      draft.category = category;
      draft.sources.category = source;
      return;
    }
  }
};

const applySize = (
  draft: GarmentPrefill,
  { meta, pageUrl, group, variantSize }: Context,
) => {
  // Sizes are offered, never chosen: a page lists every size it sells, and
  // picking one for the user would be a coin flip.
  const offered = productNodes(meta.jsonLd)
    .filter((n) => !n.isGroup)
    .map((n) => named(n.node.size))
    .filter((s): s is string => Boolean(s));
  draft.sizeOptions = [...new Set(offered)]
    .slice(0, 40)
    .map((size) => truncate(size, 64));

  const chosen = meta.meta['product:size'] ?? sizeFromQuery(pageUrl);
  if (chosen) {
    draft.size = truncate(chosen, 64);
    draft.sources.size = 'url';
  } else if (offered.length <= 1 && !group && variantSize) {
    draft.size = truncate(variantSize, 64);
    draft.sources.size = 'jsonld';
  }
};

const applyNotes = (draft: GarmentPrefill, { field, meta }: Context) => {
  const stated = str(field('description'));
  const description = stripHtml(
    stated ?? meta.meta['og:description'] ?? meta.meta.description ?? '',
  );
  const notes = [
    description,
    priceLine(field('offers')),
    conditionLine(field('offers')),
  ]
    .filter(Boolean)
    .join('\n');
  if (notes) {
    draft.notes = notes.slice(0, 1000);
    draft.sources.notes = stated ? 'jsonld' : 'opengraph';
  }
};

const safeHost = (url: string): string | undefined => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
};

const canonical = (meta: PageMetadata, pageUrl: string, host?: string) => {
  const declared = meta.meta['og:url'];
  if (!declared) return undefined;
  const resolved = absolute(declared, pageUrl);
  return resolved && safeHost(resolved) === host ? resolved : undefined;
};

const pathWords = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g, ' ');
  } catch {
    return '';
  }
};

const sizeFromQuery = (url: string): string | undefined => {
  try {
    const params = new URL(url).searchParams;
    for (const key of ['size', 'sz', 'taille', 'talla', 'größe', 'grosse']) {
      const value = params.get(key);
      if (value && value.length <= 32) return value;
    }
  } catch {
    /* an unparseable URL simply has no size */
  }
  return undefined;
};

const breadcrumbTrail = (blocks: unknown[]): string =>
  collectJsonLdNodes(blocks)
    .filter((node) => hasType(node, 'breadcrumblist'))
    .flatMap((node) => {
      const items = node.itemListElement;
      return Array.isArray(items) ? items : [];
    })
    .map((item) => {
      const record = item as Record<string, unknown>;
      return named(record.name) ?? named(record.item);
    })
    .filter(Boolean)
    .slice(-2)
    .join(' ');

const offerRecord = (offers: unknown): Record<string, unknown> | undefined => {
  const first = Array.isArray(offers) ? offers[0] : offers;
  return first && typeof first === 'object'
    ? (first as Record<string, unknown>)
    : undefined;
};

const priceLine = (offers: unknown): string | undefined => {
  const offer = offerRecord(offers);
  if (!offer) return undefined;
  const price = str(offer.price) ?? str(offer.lowPrice);
  const currency = str(offer.priceCurrency);
  return price ? `Price: ${price}${currency ? ` ${currency}` : ''}` : undefined;
};

const conditionLine = (offers: unknown): string | undefined => {
  const condition = str(offerRecord(offers)?.itemCondition);
  if (!condition) return undefined;
  const label = condition
    .split('/')
    .pop()
    ?.replace(/Condition$/, '');
  return label ? `Condition: ${label}` : undefined;
};

const imageCandidates = (
  meta: PageMetadata,
  variant: Record<string, unknown> | undefined,
  group: Record<string, unknown> | undefined,
  pageUrl: string,
): string[] => {
  const ordered = [
    ...imageUrls(variant?.image),
    ...imageUrls(group?.image),
    ...meta.ogImages,
    meta.meta['twitter:image'],
    meta.meta['twitter:image:src'],
    meta.meta.image,
    meta.linkImageSrc,
  ].filter((c): c is string => Boolean(c));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of ordered) {
    const resolved = absolute(candidate, pageUrl);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  }
  return out.slice(0, 5);
};
