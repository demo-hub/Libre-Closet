import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { join } from 'path';
import { colorLabel } from './color-label';

describe('an AI suggestion', () => {
  const hbs = Handlebars.create();
  hbs.registerHelper('t', (key: string) => key);
  hbs.registerHelper('colorLabel', (value: string) =>
    colorLabel(value, (key) => `[${key}]`),
  );
  hbs.registerHelper('icon', () => '');
  const template = hbs.compile(
    readFileSync(
      join(__dirname, '..', '..', 'views', 'partials', 'aiSuggestion.hbs'),
      'utf8',
    ),
  );
  const chips = (colors: string[]) =>
    template({ suggestion: { colors } }).replace(/\s+/g, ' ');

  it('names a known colour in the reader language, and keeps the value for its box', () => {
    const html = chips(['red']);
    expect(html).toContain('[lang.COLOR_RED]');
    expect(html).toContain("[value='red']");
  });

  it('shows a custom colour as suggested', () => {
    expect(chips(['teal'])).toContain('teal');
  });
});
