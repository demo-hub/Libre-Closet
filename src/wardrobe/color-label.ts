import { GarmentColor } from './garment-color.enum';

const KNOWN = new Set<string>(Object.values(GarmentColor));

/**
 * What a colour reads as: a known one in the reader's language, a custom one as
 * typed. A custom colour never reaches the translator, which would expand any
 * `$t(...)` in it. Values stay the stored enum names everywhere else.
 */
export function colorLabel(
  value: string,
  translate: (key: string) => string,
): string {
  return KNOWN.has(value.toLowerCase())
    ? translate(`lang.COLOR_${value.toUpperCase()}`)
    : value;
}

/** A stored comma-joined list as one line of labels. */
export function colorLabels(
  value: string | undefined,
  translate: (key: string) => string,
): string {
  if (!value) return '';
  return value
    .split(',')
    .map((color) => colorLabel(color.trim(), translate))
    .join(', ');
}
