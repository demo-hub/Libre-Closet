/**
 * The word matching both mappers do. Shared so a page cannot slip past one of
 * them with a trick the other already handles.
 */

/** Comparison form: no accents, no invisible characters, one kind of hyphen. */
export const fold = (value: string): string =>
  value
    .normalize('NFKC')
    // Soft hyphens and zero-width marks, which a page uses to break a match.
    .replace(/\p{Cf}|­/gu, '')
    .replace(/[‐-―−]/gu, '-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Where the needle appears as a whole word, or -1. Letters and digits bound it. */
export const matchAt = (haystack: string, needle: string): number => {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    const before = at === 0 ? ' ' : haystack[at - 1];
    const after =
      at + needle.length >= haystack.length
        ? ' '
        : haystack[at + needle.length];
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
      return at;
    }
    from = at + 1;
  }
};

export const containsWord = (haystack: string, needle: string): boolean =>
  matchAt(haystack, needle) !== -1;

/** A pattern matching any of these words, whole and longest-first. */
export const wordsPattern = (words: string[]): RegExp =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${words
      .map(fold)
      .sort((a, b) => b.length - a.length)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})(?![\\p{L}\\p{N}])`,
    'gu',
  );
