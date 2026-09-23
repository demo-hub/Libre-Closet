import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { join } from 'path';

/** tokens.json (vendored from the brand repo) decides which colours may meet; passing a contrast ratio is not enough. */

const root = join(__dirname, '..', '..');
const tokens = JSON.parse(
  readFileSync(join(__dirname, 'tokens.json'), 'utf8'),
) as Tokens;
const mainCss = readFileSync(join(root, 'views/assets/main.css'), 'utf8');
/** The stylesheet with /* … *\/ comments removed, so prose cannot trip a check. */
const mainCssCode = mainCss.replace(/\/\*[\s\S]*?\*\//g, '');

type Pairing = {
  foreground: string;
  background: string;
  usage?: string;
};
type Tokens = {
  colours: { id: string; value: { hex: string } }[];
  approved_pairings: Pairing[];
  non_text_only: Pairing[];
  avoid: Pairing[];
};

/** Skipped files, each tagged with the PR that sweeps it; only ever shrinks, and PR 12 asserts it is empty. */
const KNOWN_DEBT = [
  'views/index.hbs', // PR 11a
  'views/about.hbs', // PR 11a
  'views/privacy.hbs', // PR 11b
  'views/terms.hbs', // PR 11b
  'views/offline.hbs', // PR 7
  'views/error.hbs', // PR 7
  'views/chat.hbs', // PR 10
  'views/files.hbs', // PR 10
  'views/share.hbs', // PR 10
  'views/auth/login.hbs', // PR 7
  'views/auth/register.hbs', // PR 7
  'views/auth/reset.hbs', // PR 7
  'views/auth/reset-code.hbs', // PR 7
  'views/auth/update-email.hbs', // PR 7
  'views/auth/delete-account.hbs', // PR 7
  'views/auth/profile.hbs', // PR 7
  'views/calendar/index.hbs', // PR 9b
  'views/outfits/index.hbs', // PR 9a
  'views/outfits/show.hbs', // PR 9a
  'views/outfits/form.hbs', // PR 9a
  'views/wardrobe/index.hbs', // PR 8a
  'views/wardrobe/show.hbs', // PR 8b
  'views/wardrobe/form.hbs', // PR 8b
  'views/wardrobe-share/invite.hbs', // PR 7
  'views/wardrobe-share/manage.hbs', // PR 10
  'views/wardrobe-share/partials/invite-link-result.hbs', // PR 10
  'views/partials/aiSuggestion.hbs', // PR 8b
  'views/partials/photoPicker.hbs', // PR 8c
  'views/partials/maskEditor.hbs', // PR 8c
  'views/partials/colorMultiSelect.hbs', // PR 8c
  'views/partials/outfit_row.hbs', // PR 9a
  'views/partials/garmentModal.hbs', // PR 9a
  'views/partials/calendar_worn_button.hbs', // PR 9b
  'views/partials/suggestedBadge.hbs', // PR 8b
  'public/js/color-multiselect.js', // PR 8c
  'public/js/color-suggest.js', // PR 8b
  'public/js/mask-editor.js', // PR 8c
];

const hexes = new Set(tokens.colours.map((c) => c.value.hex.toLowerCase()));
const idByHex = new Map(
  tokens.colours.map((c) => [c.value.hex.toLowerCase(), c.id]),
);

/** The declarations inside a named `@plugin "daisyui/theme"` block. */
function themeBlock(name: string): Record<string, string> {
  const start = mainCss.indexOf(`name: "${name}"`);
  expect(start).toBeGreaterThan(-1);
  const body = mainCss.slice(start, mainCss.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const [, prop, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[prop] = value.trim();
  }
  return out;
}

const themes = { light: themeBlock('light'), dark: themeBlock('dark') };

/** The token id a theme role resolves to, e.g. `--color-primary` -> `cobalt`. */
function tokenOf(mode: 'light' | 'dark', role: string): string {
  const hex = themes[mode][role];
  expect(hex).toBeDefined();
  const id = idByHex.get(hex.toLowerCase());
  expect(id).toBeDefined();
  return id as string;
}

function listed(list: Pairing[], fg: string, bg: string): Pairing | undefined {
  return list.find((p) => p.foreground === fg && p.background === bg);
}

describe('brand tokens', () => {
  it('spends only colours the brand palette defines', () => {
    for (const [mode, block] of Object.entries(themes)) {
      for (const [prop, value] of Object.entries(block)) {
        if (!value.startsWith('#')) continue;
        expect({ mode, prop, value: value.toLowerCase() }).toEqual({
          mode,
          prop,
          value: expect.stringMatching(
            new RegExp(`^(${[...hexes].join('|')})$`),
          ),
        });
      }
    }
  });

  it('carries every role, so no stock daisyUI colour can show through', () => {
    const required = [
      'base-100',
      'base-200',
      'base-300',
      'base-content',
      'primary',
      'primary-content',
      'secondary',
      'secondary-content',
      'accent',
      'accent-content',
      'neutral',
      'neutral-content',
      'info',
      'info-content',
      'success',
      'success-content',
      'warning',
      'warning-content',
      'error',
      'error-content',
    ];
    for (const mode of ['light', 'dark'] as const) {
      for (const role of required) {
        expect(`${mode} --color-${role}`).toBe(
          themes[mode][`--color-${role}`] ? `${mode} --color-${role}` : 'unset',
        );
      }
    }
  });
});

describe('every pairing the theme produces', () => {
  /** foreground role, background role, and how the pairing is used. */
  const pairs: [string, string, 'text' | 'ui' | 'non-text'][] = [
    ['--color-base-content', '--root-bg', 'text'],
    ['--color-base-content', '--color-base-100', 'text'],
    ['--color-base-content', '--color-base-200', 'text'],
    ['--color-primary-content', '--color-primary', 'text'],
    ['--color-primary', '--color-base-100', 'text'],
    ['--color-primary', '--root-bg', 'text'],
    ['--mq-text-secondary', '--color-base-100', 'text'],
    ['--mq-text-secondary', '--color-base-200', 'text'],
    ['--mq-text-secondary', '--root-bg', 'text'],
    ['--color-success', '--color-base-100', 'text'],
    ['--color-success', '--root-bg', 'text'],
    ['--color-error', '--color-base-100', 'text'],
    ['--color-error', '--root-bg', 'text'],
    ['--color-warning', '--color-base-100', 'text'],
    ['--color-warning', '--root-bg', 'text'],
    ['--mq-border', '--color-base-100', 'ui'],
    ['--mq-border', '--root-bg', 'ui'],
    ['--mq-focus', '--root-bg', 'ui'],
    ['--mq-decorative', '--color-base-100', 'non-text'],
    ['--mq-decorative', '--root-bg', 'non-text'],
  ];

  for (const mode of ['light', 'dark'] as const) {
    for (const [fgRole, bgRole, usage] of pairs) {
      it(`${mode}: ${fgRole} on ${bgRole} is approved for ${usage}`, () => {
        const fg = tokenOf(mode, fgRole);
        const bg = tokenOf(mode, bgRole);
        const approved = listed(tokens.approved_pairings, fg, bg);
        const nonText = listed(tokens.non_text_only, fg, bg);
        // A ui or non-text pairing may be satisfied by either list; text may not.
        const ok =
          usage === 'text' ? Boolean(approved) : Boolean(approved ?? nonText);
        expect(`${fg} on ${bg}: ${ok ? 'listed' : 'NOT LISTED'}`).toBe(
          `${fg} on ${bg}: listed`,
        );
        expect(listed(tokens.avoid, fg, bg)).toBeUndefined();
      });
    }
  }

  // Light only: the dark palette does list these colours on Night surface.
  for (const fgRole of [
    '--mq-border',
    '--color-success',
    '--color-error',
    '--color-warning',
    '--mq-decorative',
  ]) {
    it(`light: ${fgRole} is never placed on Surface`, () => {
      const fg = tokenOf('light', fgRole);
      const bg = tokenOf('light', '--color-base-200');
      expect(listed(tokens.approved_pairings, fg, bg)).toBeUndefined();
      expect(listed(tokens.non_text_only, fg, bg)).toBeUndefined();
    });
  }
});

describe('main.css', () => {
  it('keeps colour literals to the theme blocks and the garment swatches', () => {
    const withoutThemes = mainCssCode.replace(
      /@plugin "daisyui\/theme" \{[\s\S]*?\n\}/g,
      '',
    );
    // By rule, not by line: .ms-swatch--pattern's gradient spans several lines.
    const offenders = withoutThemes
      .split('}')
      .map((rule) => rule.trim())
      .filter((rule) =>
        /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(|\boklch\(/.test(rule),
      )
      .filter((rule) => !/\.ms-swatch--/.test(rule)) // garment colours are content
      .map((rule) => rule.split('\n')[0]);
    expect(offenders).toEqual([]);
  });

  it('has exactly one @layer utilities block and no @layer components', () => {
    expect(mainCssCode.match(/@layer utilities/g)?.length).toBe(1);
    expect(mainCssCode).not.toContain('@layer components');
  });

  it('keeps the design record and the brand spec out of the class scan', () => {
    expect(mainCss).toContain('@source not "../../docs"');
    expect(mainCss).toContain('@source not "../../src/brand"');
  });
});

describe('templates and client scripts', () => {
  const forbidden: [RegExp, string][] = [
    [/text-base-content\//, 'opacity-blended text: use text-graphite'],
    [/bg-base-content\//, 'opacity-blended fill: use a token'],
    [
      /\balert-info\b|\blink-info\b|\btext-info\b|\bborder-info\b/,
      'ch. 08: there is no info colour',
    ],
    [
      /\balert-(soft|outline|dash)\b/,
      'alerts are Ink on White with a status rail',
    ],
    [
      /\bbadge-(primary|secondary|accent|warning|info|success|error)\b/,
      'one neutral badge',
    ],
    [
      /\bbtn-(neutral|success|error|warning|secondary|accent|info|xs)\b/,
      'primary, outline or ghost only',
    ],
    [/\b(input-xs|badge-xs|range-xs)\b/, 'below the 12 px floor'],
    [/text-\[\d+px\]/, 'off the type scale'],
    [
      /<h[1-3][^>]*\btext-(xs|sm|base|lg)(?![\w-])/,
      'a heading below the h3 size, where Plus Jakarta Sans runs its words together',
    ],
    [/\buppercase\b/, 'ch. 09: sentence case, no all-caps labels'],
    [/\bdark:/, 'dark mode comes from the theme, not a variant'],
    [
      /\bloading loading-/,
      'daisyUI spinners animate with SMIL: use the spinner partial',
    ],
    [/\bmockup-code\b/, 'use the code-block class'],
    [/\bdrawer\b/, 'the drawer is gone'],
    [/style="[^"]*(hsl\(|rgb\(|#[0-9a-fA-F]{3})/, 'inline colour'],
    [/lazztech_|lazz\.tech/, 'the fork has its own identity'],
    [/mandatiq/i, 'the name belongs in README.md and ABOUT_FORK only'],
    [
      /\b(text-steel|bg-steel|bg-haze)\b/,
      'ch. 06: Steel and Haze are not text or fill colours',
    ],
    [
      /&times;|&middot;|&#8249;|&#8250;|&lsaquo;|&rsaquo;|♥|✓|✕|‹|›/,
      'ch. 10: words, not symbols',
    ],
  ];

  const files = [
    ...globSync('views/**/*.hbs', { cwd: root }),
    ...globSync('public/js/*.js', { cwd: root }),
  ]
    .map((f) => f.split('\\').join('/'))
    .filter((f) => !KNOWN_DEBT.includes(f));

  it('flags a small heading but not a heading in the text colour', () => {
    const [heading] = forbidden.find(([, why]) => why.startsWith('a heading'))!;
    expect(heading.test('<h2 class="card-title text-lg">')).toBe(true);
    expect(heading.test('<h3 class="text-base">')).toBe(true);
    expect(heading.test('<h2 class="text-h3 text-base-content">')).toBe(false);
  });

  it('checks the files that have been swept', () => {
    // Guards the guard: a typo in KNOWN_DEBT would silently empty this suite.
    expect(files.length).toBeGreaterThan(0);
    for (const debt of KNOWN_DEBT) {
      expect(`${debt} exists`).toBe(
        globSync(debt, { cwd: root }).length ? `${debt} exists` : 'missing',
      );
    }
  });

  for (const file of files) {
    it(`${file} uses only approved classes`, () => {
      const source = readFileSync(join(root, file), 'utf8');
      const hits = forbidden
        .filter(([pattern]) => pattern.test(source))
        .map(([pattern, why]) => `${pattern} — ${why}`);
      expect(hits).toEqual([]);
    });
  }
});

describe('the browser chrome follows the theme', () => {
  const layout = readFileSync(join(root, 'views/layout.hbs'), 'utf8');
  const manifest = JSON.parse(
    readFileSync(join(root, 'public/manifest.json'), 'utf8'),
  ) as { theme_color: string; background_color: string };

  it('declares a theme colour for each mode', () => {
    expect(layout).toContain(
      '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
    );
    expect(layout).toContain(
      '<meta name="theme-color" content="#161d38" media="(prefers-color-scheme: dark)" />',
    );
    expect(layout).toContain(
      '<meta name="color-scheme" content="light dark" />',
    );
  });

  it('paints the install splash in palette colours', () => {
    expect(hexes.has(manifest.theme_color.toLowerCase())).toBe(true);
    expect(hexes.has(manifest.background_color.toLowerCase())).toBe(true);
  });
});
