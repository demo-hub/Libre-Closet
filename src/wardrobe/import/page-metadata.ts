/**
 * Reads the few things a product page is worth asking for: its JSON-LD blocks,
 * meta tags, title and first heading.
 *
 * Deliberately not a DOM parser, and deliberately not a set of tag-shaped
 * regexes either: a pattern like `<meta[^>]*>` rescans the whole document from
 * every opening tag when the closing one never arrives. The scan below walks
 * the page once with indexOf, so a hostile page costs what an honest one does.
 */
export interface PageMetadata {
  /** Parsed ld+json blocks; unparseable ones are skipped rather than fatal. */
  jsonLd: unknown[];
  /** Lower-cased property or name, first occurrence wins, as ogp.me specifies. */
  meta: Record<string, string>;
  /** og:image in document order, each secure_url immediately before its own image. */
  ogImages: string[];
  title?: string;
  h1?: string;
  linkImageSrc?: string;
}

/** Enough for any real tag; the rest of an absurd one holds no attribute we want. */
const MAX_TAG = 8192;
const MAX_OG_IMAGES = 20;

/** Out of range and surrogate references become U+FFFD, as the HTML spec says. */
const codePoint = (value: number): string =>
  Number.isInteger(value) &&
  value > 0 &&
  value <= 0x10ffff &&
  (value < 0xd800 || value > 0xdfff)
    ? String.fromCodePoint(value)
    : '�';

const decodeEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      codePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  ).exec(tag);
  if (!match) return undefined;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
};

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The text between a start tag and its closing twin, or undefined if unclosed. */
const contentOf = (
  html: string,
  name: string,
  from: number,
): { text: string; end: number } | undefined => {
  // A sticky search rather than toLowerCase(): lowercasing the whole document
  // once per tag is the quadratic scan this function exists to avoid.
  const closing = new RegExp(`</${name}\\b`, 'gi');
  closing.lastIndex = from;
  const match = closing.exec(html);
  if (!match) return undefined;
  return { text: html.slice(from, match.index), end: match.index };
};

export function readPageMetadata(html: string): PageMetadata {
  const result: PageMetadata = { jsonLd: [], meta: {}, ogImages: [] };
  // Once a closing tag is missing it is missing for every later one too, and
  // searching again per tag would be the quadratic scan all over again.
  const unclosed = new Set<string>();
  let cursor = 0;

  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) break;
    const close = html.indexOf('>', open + 1);
    // An unterminated tag means the document is truncated; nothing usable follows.
    if (close === -1) break;
    cursor = close + 1;

    const tag = html.slice(open, Math.min(close + 1, open + MAX_TAG));
    const name = /^<([a-z][a-z0-9]*)/i.exec(tag)?.[1].toLowerCase();
    if (!name) continue;

    if (name === 'script') {
      const body = contentOf(html, 'script', cursor);
      // Everything after an unclosed script is script content, by the parsing rules.
      if (!body) break;
      cursor = body.end;
      readJsonLd(tag, body.text, result);
    } else if (name === 'meta') {
      readMeta(tag, result);
    } else if (
      name === 'title' &&
      result.title === undefined &&
      !unclosed.has('title')
    ) {
      const body = contentOf(html, 'title', cursor);
      if (!body) unclosed.add('title');
      else {
        result.title = collapse(decodeEntities(body.text));
        cursor = body.end;
      }
    } else if (
      name === 'h1' &&
      result.h1 === undefined &&
      !unclosed.has('h1')
    ) {
      const body = contentOf(html, 'h1', cursor);
      if (!body) unclosed.add('h1');
      else {
        result.h1 = collapse(
          decodeEntities(body.text.replace(/<[^>]*>/g, ' ')),
        );
        cursor = body.end;
      }
    } else if (
      name === 'link' &&
      result.linkImageSrc === undefined &&
      /\brel\s*=\s*["']?image_src/i.test(tag)
    ) {
      result.linkImageSrc = attribute(tag, 'href');
    }
  }

  return result;
}

const readJsonLd = (tag: string, body: string, result: PageMetadata) => {
  const type = attribute(tag, 'type');
  if (!type || !/application\/ld\+json/i.test(type)) return;
  try {
    // Control characters and a trailing semicolon are both common in the wild.
    const raw = body.replace(/[\p{Cc}\p{Cf}]/gu, ' ');
    result.jsonLd.push(JSON.parse(raw.trim().replace(/;$/, '')));
  } catch {
    /* a broken block must not cost us the readable ones */
  }
};

const readMeta = (tag: string, result: PageMetadata) => {
  const key = (
    attribute(tag, 'property') ??
    attribute(tag, 'name') ??
    attribute(tag, 'itemprop') ??
    // http-equiv, so a challenge page's meta refresh is visible downstream.
    attribute(tag, 'http-equiv')
  )?.toLowerCase();
  const content = attribute(tag, 'content');
  if (!key || content === undefined) return;

  if ((key === 'og:image' || key === 'og:image:url') && content) {
    if (result.ogImages.length < MAX_OG_IMAGES) result.ogImages.push(content);
  }
  if (key === 'og:image:secure_url' && content) {
    // A structured property of the image it follows, and preferred over it.
    result.ogImages.splice(Math.max(result.ogImages.length - 1, 0), 0, content);
  }
  result.meta[key] ??= content;
};

export interface JsonLdNode {
  node: Record<string, unknown>;
  /** Reached only through a list of other things, so probably not this page's product. */
  listed: boolean;
}

/** The properties a product hides behind, and whether they mean "some other product". */
const NESTED: [string, boolean][] = [
  ['@graph', false],
  ['hasVariant', false],
  ['isVariantOf', false],
  ['mainEntity', false],
  ['mainEntityOfPage', false],
  ['offers', false],
  ['itemOffered', false],
  ['itemListElement', true],
  ['item', true],
];

/**
 * Flattens the shapes JSON-LD actually arrives in: a bare object, a top-level
 * array, or an `@graph`, with nested products reached through the properties
 * that carry them.
 */
export function collectJsonLd(blocks: unknown[]): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number, listed: boolean) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1, listed);
      return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    const record = node as Record<string, unknown>;
    out.push({ node: record, listed });
    for (const [key, isList] of NESTED) {
      if (key in record) walk(record[key], depth + 1, listed || isList);
    }
  };

  for (const block of blocks) walk(block, 0, false);
  return out;
}

export const collectJsonLdNodes = (
  blocks: unknown[],
): Record<string, unknown>[] =>
  collectJsonLd(blocks).map((entry) => entry.node);

/** `@type` is a string on most pages and an array on some. */
export function hasType(node: Record<string, unknown>, ...types: string[]) {
  const raw = node['@type'];
  const actual = Array.isArray(raw) ? raw : [raw];
  return actual.some(
    (t) => typeof t === 'string' && types.includes(t.toLowerCase()),
  );
}
