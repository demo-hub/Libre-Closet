import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';

const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (locale: string) =>
  JSON.parse(read(`src/i18n/${locale}/lang.json`)) as Record<string, string>;

type Page = 'privacy' | 'terms';

/** The real templates with a locale's values, as a deployment's view context renders them. */
function render(
  page: Page,
  context: Record<string, unknown> = {},
  locale = 'en',
) {
  const values = load(locale);
  const hbs = Handlebars.create();
  hbs.registerHelper('t', (key: string) => {
    const value = values[key.replace(/^lang\./, '')];
    if (value === undefined) throw new Error(`${key} is not in ${locale}`);
    return value;
  });
  hbs.registerHelper('json', (value: unknown) => JSON.stringify(value));
  hbs.registerPartial('navbar', '');
  hbs.registerPartial('dock', '');
  hbs.registerPartial(
    'instanceContact',
    read('views/partials/instanceContact.hbs'),
  );
  return hbs.compile(read(`views/${page}.hbs`))({
    siteUrl: 'https://closet.example',
    sourceUrl: 'https://git.example/closet',
    operatorName: '',
    operatorContact: '',
    ...context,
  });
}

const en = load('en');
const shown = (html: string, key: string) =>
  html.includes(Handlebars.escapeExpression(en[key]));
const headings = (html: string, level: number) =>
  [
    ...html.matchAll(new RegExp(`<h${level}[^>]*>([^<]*)</h${level}>`, 'g')),
  ].map(([, text]) => text);

describe('the privacy policy', () => {
  it('has one heading and the five sections of plan 5.6', () => {
    const html = render('privacy');
    expect(headings(html, 1)).toEqual([en.PRIVACY_HEADING]);
    expect(headings(html, 2)).toEqual([
      'What is stored',
      'Where it is stored',
      'Third parties',
      'Your rights',
      'Contact',
    ]);
    expect(headings(html, 3)).toEqual([]);
  });

  it.each([
    [false, false, false],
    [false, true, false],
    [true, true, false],
    [true, false, true],
    [false, true, true],
  ])(
    'with accounts %s, link import %s and AI %s, describes only what is on',
    (authEnabled, importUrlEnabled, aiEnabled) => {
      const html = render('privacy', {
        authEnabled,
        importUrlEnabled,
        aiEnabled,
      });
      expect(shown(html, 'PRIVACY_NO_ACCOUNTS')).toBe(!authEnabled);
      expect(shown(html, 'PRIVACY_EMAIL_DESC')).toBe(authEnabled);
      expect(shown(html, 'PRIVACY_SELF_HOSTED_IMPORT_DESC')).toBe(
        importUrlEnabled,
      );
      expect(shown(html, 'PRIVACY_AI_DESC')).toBe(aiEnabled);
      expect(shown(html, 'PRIVACY_AI_DESC_2')).toBe(aiEnabled);
    },
  );
});

describe('the terms of service', () => {
  it('has one heading and the four sections of plan 5.6', () => {
    const html = render('terms');
    expect(headings(html, 1)).toEqual([en.TERMS_HEADING]);
    expect(headings(html, 2)).toEqual([
      'Service description',
      'Licence',
      'No warranty',
      'Contact',
    ]);
  });

  it('links to the source code from the licence', () => {
    expect(render('terms')).toMatch(
      /<a href="https:\/\/git\.example\/closet"[^>]*>Source code<\/a>/,
    );
  });
});

const pages: [Page, string, string][] = [
  ['privacy', 'PRIVACY_CONTACT_DESC', 'PRIVACY_TITLE'],
  ['terms', 'TERMS_CONTACT_DESC', 'TERMS_TITLE'],
];

for (const [page, fallback] of pages)
  describe(`contact on the ${page} page`, () => {
    const contact = (operatorName: string, operatorContact: string) => {
      const html = render(page, { operatorName, operatorContact });
      return {
        fallback: shown(html, fallback),
        address: /<address[^>]*>(.*?)<\/address>/s.exec(html)?.[1] ?? null,
      };
    };

    it('tells readers to contact the person who runs the instance when nothing is set', () => {
      expect(contact('', '')).toEqual({ fallback: true, address: null });
    });

    it('names the operator under that sentence when only a name is set', () => {
      expect(contact('Jane Doe', '')).toEqual({
        fallback: true,
        address: 'Jane Doe',
      });
    });

    it('shows the contact in place of the sentence', () => {
      expect(contact('', 'closet@example.com')).toEqual({
        fallback: false,
        address: 'closet@example.com',
      });
      expect(contact('Jane Doe', 'closet@example.com')).toEqual({
        fallback: false,
        address: 'Jane Doe<br>closet@example.com',
      });
    });

    it('escapes what the operator wrote', () => {
      expect(contact('<b>Jane</b> & Co', 'a"b').address).toBe(
        '&lt;b&gt;Jane&lt;/b&gt; &amp; Co<br>a&quot;b',
      );
    });
  });

for (const locale of ['en', 'de', 'fr', 'ru'])
  describe(`breadcrumbs in ${locale}`, () => {
    const values = load(locale);

    for (const [page, , title] of pages)
      it(`name the ${page} page in the reader's language`, () => {
        const html = render(page, {}, locale);
        const script =
          /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(
            html,
          )?.[1];
        const crumbs = JSON.parse(script ?? '') as {
          itemListElement: { name: string; item: string }[];
        };
        expect(crumbs.itemListElement).toEqual([
          expect.objectContaining({
            name: values.HOME,
            item: 'https://closet.example/',
          }),
          expect.objectContaining({
            name: values[title],
            item: `https://closet.example/${page}`,
          }),
        ]);
      });
  });
