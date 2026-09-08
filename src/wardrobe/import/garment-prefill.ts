import { GarmentColor } from '../garment-color.enum';

/** Where a suggested value came from, shown to the user as a "suggested" hint. */
export type PrefillSource =
  | 'jsonld'
  | 'shopify'
  | 'opengraph'
  | 'title'
  | 'url'
  | 'heuristic';

export interface GarmentPrefill {
  name?: string;
  category?: string;
  brand?: string;
  /** Enum values, comma-joined the way the form and the column store them. */
  colors: GarmentColor[];
  /** Colour words the page stated that are not in the enum; rendered pre-checked. */
  customColors: string[];
  size?: string;
  /** Sizes the page offers, for the datalist. Never auto-filled into `size`. */
  sizeOptions: string[];
  notes?: string;
  sourceUrl?: string;
  /** Ordered best-first; only the first is downloaded unless the user asks. */
  imageCandidates: string[];
  sources: Partial<Record<keyof GarmentPrefill, PrefillSource>>;
}

export const emptyPrefill = (): GarmentPrefill => ({
  colors: [],
  customColors: [],
  sizeOptions: [],
  imageCandidates: [],
  sources: {},
});

/** Postgres keeps name, brand and size at varchar(255). */
export const truncate = (value: string, max = 255): string =>
  value.length > max ? value.slice(0, max).trimEnd() : value;

/**
 * Turns a description's markup into the plain text the notes field holds.
 * The slice is what keeps it linear: an unterminated `<` makes every tag
 * pattern rescan to the end, and notes are capped at a thousand characters
 * anyway.
 */
export const stripHtml = (html: string): string =>
  html
    .slice(0, 8000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const TRACKING_PARAMS =
  /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|mc_[ce]id$|igshid$|_branch_)/i;

/** Drops campaign noise so the stored link is the page itself. */
export function cleanSourceUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = '';
    // Rebuilt in one pass: delete() rescans the whole list per call.
    const kept = [...url.searchParams].filter(
      ([key]) => !TRACKING_PARAMS.test(key),
    );
    url.search = new URLSearchParams(kept).toString();
    return url.href;
  } catch {
    return input;
  }
}
