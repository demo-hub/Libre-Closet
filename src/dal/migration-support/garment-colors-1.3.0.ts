/**
 * normalizeColorInput as it was in 1.3.0, frozen for Migration20261103120000
 * (SQLite and Postgres). A migration must do the same thing whenever it runs,
 * so it does not import the live helper, which later releases may change.
 * Kept outside migrations/, whose every file is loaded as a migration.
 */
const KNOWN = new Set([
  'red',
  'pink',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'black',
  'white',
  'grey',
  'beige',
  'brown',
  'gold',
  'silver',
  'pattern',
  'other',
]);
const MAX_COLOR_LENGTH = 40;
const MAX_COLORS = 24;

export function normalizeGarmentColors130(value: string): string {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const raw of value.split(',')) {
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
