import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import { ICON_PATHS, renderIcon } from './icons';

describe('renderIcon', () => {
  // The names docs/REDESIGN.md section 5.4 promises the templates.
  const promised = [
    'hanger',
    'x-mark',
    'x-circle',
    'check',
    'check-circle',
    'circle',
    'exclamation-triangle',
    'information-circle',
    'chevron-left',
    'chevron-right',
    'arrow-left',
    'pencil',
    'trash',
    'share',
    'camera',
    'photo',
    'funnel',
    'magnifying-glass',
    'tray',
    'wifi-slash',
    'plus',
    'user',
    'link',
    'bars',
  ];

  it('has every icon the design promises, and no others', () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...promised].sort());
  });

  it.each(promised)(
    '%s is hidden from assistive technology',
    (name: string) => {
      const svg = renderIcon(name);
      expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg.match(/<path d="[^"]+"\/>/g)?.length).toBe(
        ICON_PATHS[name].length,
      );
    },
  );

  it('refuses a name it does not know, so a typo fails the render', () => {
    expect(() => renderIcon('hangar')).toThrow('Unknown icon "hangar"');
  });

  it('escapes the class it is given', () => {
    expect(renderIcon('check', 'size-5" onload="x')).toContain(
      'class="size-5&quot; onload=&quot;x"',
    );
  });

  it('renders unescaped through the Handlebars helper', () => {
    const hbs = Handlebars.create();
    hbs.registerHelper(
      'icon',
      (name: string, options: Handlebars.HelperOptions) =>
        new hbs.SafeString(
          renderIcon(name, (options.hash as { class?: string }).class),
        ),
    );
    const html = hbs.compile(
      '<button>{{icon "check" class="size-5"}}</button>',
    )({});
    expect(html).toMatch(/^<button><svg [^>]*class="size-5">/);
  });

  it('draws the same hanger as design/libre-closet-mark.svg, which the icon files are built from', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'design', 'libre-closet-mark.svg'),
      'utf8',
    );
    const paths = [...source.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual(ICON_PATHS.hanger);
  });

  it.each(['og-image.svg', 'social-preview.svg'])(
    'draws the same hanger in design/%s',
    (file) => {
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'design', file),
        'utf8',
      );
      const group = source.match(
        /stroke-linejoin="round">((?:<path d="[^"]+"\/>)+)<\/g>/,
      );
      const paths = [...(group?.[1] ?? '').matchAll(/<path d="([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(paths).toEqual(ICON_PATHS.hanger);
    },
  );
});
