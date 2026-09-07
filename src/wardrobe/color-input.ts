/** Normalizes the color multiselect's `string | string[]` input to the stored comma-joined form. */
export function normalizeColorInput(value?: string | string[]): string {
  const list = Array.isArray(value) ? value : (value?.split(',') ?? []);
  return list
    .map((c) => c.trim())
    .filter(Boolean)
    .join(',');
}
