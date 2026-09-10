/**
 * What an OS share sheet hands over, and how to find a product link in it.
 *
 * Nothing about the payload is dependable. The share target asks for `url`,
 * but Android apps routinely leave it empty and put the link in `text` with a
 * sentence around it, or in `title`, or in all three. So every field is read,
 * in the order most likely to hold the real link.
 */
export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

/** Long enough for any real share; a cap so a hostile payload cannot be huge. */
const MAX_FIELD = 4096;

/**
 * Punctuation a sentence leaves stuck to the end of a pasted link. Trimmed one
 * character at a time: an anchored `+` class backtracks over a long run of it,
 * and the run is the sharing app's to choose.
 */
const TRAILING = new Set([...'.,;:!?\'"»”’…]']);

const httpUrl = (candidate: string): string | undefined => {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Trims what punctuation the sharing app left on. A closing bracket is only
 * trimmed when nothing opened it, so a Wikipedia-style `..._(disambiguation)`
 * survives.
 */
const trimTail = (candidate: string): string => {
  let end = candidate.length;
  while (end > 0 && TRAILING.has(candidate[end - 1])) end -= 1;
  let out = candidate.slice(0, end);
  while (out.endsWith(')') && !out.includes('(')) out = out.slice(0, -1);
  return out;
};

/**
 * Every http(s) link in a piece of shared text, in the order they appear. A
 * match that runs to the cap is dropped rather than trimmed: half a URL is
 * still a valid URL, and importing a different page than the one shared is
 * worse than importing nothing.
 */
const linksIn = (value: string): string[] => {
  const capped = value.slice(0, MAX_FIELD);
  const found: string[] = [];
  for (const match of capped.matchAll(/https?:\/\/\S+/gi)) {
    const ranToTheEnd =
      match.index + match[0].length >= capped.length &&
      value.length > capped.length;
    if (ranToTheEnd) break;
    const url = httpUrl(trimTail(match[0]));
    if (url) found.push(url);
  }
  return found;
};

/**
 * The link the user meant to share. `url` is the field the share target asks
 * for and the only one that arrives clean, so it is tried whole before either
 * of the free-text fields is searched.
 */
export function pickSharedUrl(payload: SharePayload): string | undefined {
  const stated = payload.url?.trim();
  if (stated) {
    const direct = httpUrl(stated.slice(0, MAX_FIELD));
    if (direct) return direct;
    // Some apps put a whole sentence in `url`; it may still hold a link.
    const embedded = linksIn(stated)[0];
    if (embedded) return embedded;
  }

  for (const field of [payload.text, payload.title]) {
    const found = field ? linksIn(field)[0] : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * What is left once the link is taken out: the title an app shared, useful as
 * a garment name when the page itself cannot be read. Returns undefined when
 * it is only the link again, or a subject line of no value.
 */
export function pickSharedTitle(payload: SharePayload): string | undefined {
  for (const field of [payload.title, payload.text]) {
    const value = field?.slice(0, MAX_FIELD).trim();
    if (!value) continue;
    const withoutLink = value
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Only what is left once the links are gone; a field that was nothing but
    // a link has nothing to contribute.
    if (withoutLink.length >= 3) return withoutLink;
  }
  return undefined;
}
