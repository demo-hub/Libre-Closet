import { GarmentColor } from './garment-color.enum';

/** Longer than any colour name, short enough to keep a card's chips readable. */
export const MAX_COLOR_LENGTH = 40;
/** Every known colour and then some; a pasted list stops here. */
export const MAX_COLORS = 24;

const KNOWN = new Set<string>(Object.values(GarmentColor));

/**
 * The one form a garment's colours are stored in: comma-joined, each trimmed,
 * known colours in their lower-case enum value, custom ones as typed. Markup,
 * blanks and repeats (in any case) are dropped, and long items are cut. Every
 * write goes through this, and Migration20261103120000 cleaned older rows with
 * a frozen copy (src/dal/migration-support), so a colour filter can match
 * whole items between commas. Change both only with a new migration.
 */
export function normalizeColorInput(value?: string | string[]): string {
  const list = Array.isArray(value) ? value : (value?.split(',') ?? []);
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const raw of list.flatMap((item) => String(item).split(','))) {
    // Cut by characters, not UTF-16 units, so an emoji is never split in two.
    const text = Array.from(
      raw
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
      .slice(0, MAX_COLOR_LENGTH)
      .join('')
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(KNOWN.has(key) ? key : text);
    if (colors.length === MAX_COLORS) break;
  }
  return colors.join(',');
}
