import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { globSync } from 'glob';
import { tmpdir } from 'os';
import { join } from 'path';
import { brotliCompressSync, constants } from 'zlib';

/** The stylesheet budget and the daisyUI exclude list of docs/REDESIGN.md 5.8. */

const root = join(__dirname, '..');

/** Class names a stylesheet defines, without escapes or variant prefixes (`sm\:flex` is `flex`). */
function classesIn(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/\.((?:\\.|[\w-])+)/g)].map(
      ([, name]) => name.replace(/\\/g, '').split(':').pop()!,
    ),
  );
}

describe('the compiled stylesheet', () => {
  let css: Buffer;

  beforeAll(() => {
    // Compiled here, as generate:tailwind does, so a stale public/bundle.css cannot pass.
    const dir = mkdtempSync(join(tmpdir(), 'lc-bundle-'));
    try {
      execFileSync(
        join(root, 'node_modules', '.bin', 'tailwindcss'),
        [
          '-i',
          './views/assets/main.css',
          '-o',
          join(dir, 'bundle.css'),
          '--minify',
        ],
        { cwd: root, stdio: 'ignore' },
      );
      css = readFileSync(join(dir, 'bundle.css'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('stays within 120,000 bytes minified', () => {
    expect(css.length).toBeLessThanOrEqual(120_000);
  });

  it('stays within 20,480 bytes as served, Brotli at quality 4', () => {
    const served = brotliCompressSync(css, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    });
    expect(served.length).toBeLessThanOrEqual(20_480);
  });

  it('styles every daisyUI class the pages ask for', () => {
    const mainCss = readFileSync(join(root, 'views/assets/main.css'), 'utf8');
    const excluded = /\bexclude:([^;]+);/.exec(mainCss)![1].split(',');
    expect(excluded.length).toBeGreaterThan(0);
    const defined = classesIn(css.toString());
    const missing = new Set<string>();
    for (const name of excluded.map((n) => n.trim())) {
      const file = ['components', 'utilities']
        .map((dir) => join(root, 'node_modules/daisyui', dir, `${name}.css`))
        .find((path) => existsSync(path));
      expect(`${name}: ${file ? 'found' : 'missing'}`).toBe(`${name}: found`);
      for (const cls of classesIn(readFileSync(file!, 'utf8'))) {
        if (!defined.has(cls)) missing.add(cls);
      }
    }

    const asked: string[] = [];
    const sources = globSync('{views/**/*.hbs,public/js/*.js,src/**/*.ts}', {
      cwd: root,
      ignore: ['src/**/*.spec.ts', 'src/brand/**', 'src/generated/**'],
    });
    for (const file of sources) {
      const source = readFileSync(join(root, file), 'utf8');
      const lists = [
        ...source.matchAll(/\bclass(?:Name)?\s*=\s*(["'`])([\s\S]*?)\1/g),
      ].map((m) => m[2]);
      for (const m of source.matchAll(
        /\b(?:add|remove|toggle)\s+((?:\.[\w-]+\s*)+)/g,
      )) {
        lists.push(m[1].replace(/\./g, ' '));
      }
      for (const m of source.matchAll(/classList\.\w+\(([^)]*)\)/g)) {
        lists.push(m[1].replace(/['"`,]/g, ' '));
      }
      for (const cls of lists
        .join(' ')
        .replace(/{{[^}]*}}/g, ' ')
        .split(/\s+/)) {
        if (missing.has(cls)) asked.push(`${file}: ${cls}`);
      }
    }
    expect([...new Set(asked)]).toEqual([]);
  });
});
