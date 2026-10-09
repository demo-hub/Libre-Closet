import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { jsonForScript } from './json-script';

function render(view: string, context: Record<string, unknown>): string {
  const hbs = Handlebars.create();
  hbs.registerHelper('t', (key: string) => key);
  hbs.registerHelper('json', jsonForScript);
  hbs.registerHelper('icon', () => '');
  hbs.registerPartial('navbar', '');
  hbs.registerPartial('dock', '');
  const source = readFileSync(
    join(__dirname, '..', 'views', `${view}.hbs`),
    'utf8',
  );
  return hbs.compile(source)(context);
}

const jsonLd = (html: string) =>
  [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map(([, body]) => JSON.parse(body) as Record<string, unknown>);

/** The rows of About's "This instance" list, or null when the section is left out. */
const instanceRows = (html: string) => {
  const list = html.match(
    />lang\.ABOUT_INSTANCE<\/h2>\s*<dl[^>]*>([\s\S]*?)<\/dl>/,
  );
  return list
    ? [
        ...list[1].matchAll(/<dt[^>]*>([^<]*)<\/dt>\s*<dd[^>]*>([^<]*)<\/dd>/g),
      ].map(([, dt, dd]) => [dt, dd])
    : null;
};

describe('About', () => {
  it.each([
    [{}, null],
    [{ operatorName: 'Jane Doe' }, [['lang.ABOUT_RUN_BY', 'Jane Doe']]],
    [
      { operatorContact: 'closet@example.com' },
      [['lang.ABOUT_CONTACT', 'closet@example.com']],
    ],
    [
      { operatorName: 'Jane Doe', operatorContact: 'closet@example.com' },
      [
        ['lang.ABOUT_RUN_BY', 'Jane Doe'],
        ['lang.ABOUT_CONTACT', 'closet@example.com'],
      ],
    ],
  ])('says who runs this instance from %j', (operator, rows) => {
    const html = render('about', {
      operatorName: '',
      operatorContact: '',
      ...operator,
    });
    expect(instanceRows(html)).toEqual(rows);
  });

  it('prints the operator values as text', () => {
    const html = render('about', {
      operatorName: '<b>x</b>',
      operatorContact: '',
    });
    expect(instanceRows(html)).toEqual([
      ['lang.ABOUT_RUN_BY', '&lt;b&gt;x&lt;/b&gt;'],
    ]);
  });
});

describe('the landing page', () => {
  it('keeps its JSON-LD valid whatever the app is called', () => {
    const appName = `Tom & "Jerry's" </script><script>alert(1)</script>`;
    const blocks = jsonLd(
      render('index', {
        appName,
        canonicalUrl: 'https://closet.example/',
        locale: 'de',
        sourceUrl: 'https://example.com/closet',
      }),
    );
    expect(blocks.map((block) => block.name)).toEqual([appName, appName]);
  });
});
