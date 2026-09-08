const MAX_LENGTH = 2048;

/**
 * Accepts a user-supplied source link, or undefined when it is not a plain
 * http(s) URL. Guards both storage and the outbound link rendered on the
 * garment page, so `javascript:` and friends never reach an href.
 */
export function sanitizeSourceUrl(input?: string): string | undefined {
  const value = input?.trim();
  if (!value || value.length > MAX_LENGTH) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  return url.href;
}

/** The host shown as the link's label on the garment page. */
export function sourceUrlHost(input?: string): string | undefined {
  const value = sanitizeSourceUrl(input);
  return value ? new URL(value).host : undefined;
}
