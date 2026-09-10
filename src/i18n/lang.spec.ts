import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Nothing else enforces this: nestjs-i18n falls back to English rather than
 * failing, so a missing key is invisible until a reader in that language finds
 * it. The import failure states are checked by name because they are chosen by
 * the server and looked up as `lang.${failure}`.
 */
const LOCALES = ['de', 'en', 'es', 'fr', 'it', 'ru'];

type Lang = Record<string, string | Record<string, string>>;

const load = (locale: string): Lang =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, locale, 'lang.json'), 'utf8'),
  ) as Lang;

/** `validation` is a nested group; everything else is a flat string. */
const flatten = (lang: Lang): [string, string][] =>
  Object.entries(lang).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[key, value] as [string, string]]
      : Object.entries(value).map(
          ([inner, text]) => [`${key}.${inner}`, text] as [string, string],
        ),
  );

const IMPORT_FAILURES = [
  'IMPORT_URL_INVALID',
  'IMPORT_SITE_BLOCKED',
  'IMPORT_PAGE_UNREACHABLE',
  'IMPORT_NO_IMAGE_FOUND',
  'IMPORT_IMAGE_INVALID',
  'IMPORT_DISABLED',
];

describe('translations', () => {
  const english = load('en');

  it.each(LOCALES)('%s has exactly the keys English has', (locale) => {
    const keys = flatten(load(locale))
      .map(([key]) => key)
      .sort();
    expect(keys).toEqual(
      flatten(english)
        .map(([key]) => key)
        .sort(),
    );
  });

  it.each(LOCALES)('%s declares each key once', (locale) => {
    // JSON.parse keeps the last of a repeated key and says nothing, so a new
    // translation added next to the wrong neighbour is silently dead.
    const raw = fs.readFileSync(
      path.join(__dirname, locale, 'lang.json'),
      'utf8',
    );
    const seen = new Set<string>();
    const repeated: string[] = [];
    for (const [, key] of raw.matchAll(/^\s*"([^"]+)"\s*:/gm)) {
      if (seen.has(key)) repeated.push(key);
      seen.add(key);
    }
    expect(repeated).toEqual([]);
  });

  it.each(LOCALES)('%s leaves no value empty', (locale) => {
    const empty = flatten(load(locale))
      .filter(([, value]) => !value.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  describe.each(LOCALES)('%s', (locale) => {
    const lang = load(locale);

    it.each(IMPORT_FAILURES)('says something about %s', (key) => {
      expect(lang[key]).toBeTruthy();
    });

    it('names the shop in the imported alert', () => {
      expect(lang.IMPORTED_FROM_ALERT).toContain('{host}');
    });
  });
});
