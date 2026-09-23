import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

/**
 * Nothing else checks the manifest: workbox only hashes it as bytes, and
 * Lighthouse dropped its PWA category, so a broken one would ship silently and
 * the installed app would simply stop offering itself as a share target.
 */
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'public', 'manifest.json'),
    'utf8',
  ),
) as Record<string, any>;

describe('the web app manifest', () => {
  it('keeps the identity an installed app was installed under', () => {
    // Changing any of these makes every installed PWA a different app.
    expect(manifest.id).toBe('/wardrobe');
    expect(manifest.start_url).toBe('/wardrobe');
    expect(manifest.scope).toBe('/');
  });

  describe('the share target', () => {
    const share = manifest.share_target as Record<string, any>;

    it('posts to the route that handles a share', () => {
      expect(share.action).toBe('/wardrobe/import/share');
      expect(share.method).toBe('POST');
      // Files can only be shared with multipart.
      expect(share.enctype).toBe('multipart/form-data');
    });

    it('names the three text fields the dispatcher reads', () => {
      expect(share.params.title).toBe('title');
      expect(share.params.text).toBe('text');
      expect(share.params.url).toBe('url');
    });

    it('accepts a shared photo under the name the route looks for', () => {
      expect(share.params.files).toHaveLength(1);
      expect(share.params.files[0].name).toBe('photo');
    });

    it('offers exactly the formats the image checks will take', () => {
      // Narrower and the share sheet hides photos the app could have used;
      // wider and it offers ones that are refused after the share.
      expect(new Set(share.params.files[0].accept)).toEqual(
        new Set([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'image/avif',
          'image/heic',
        ]),
      );
    });

    it('acts inside the app scope, or the browser refuses it', () => {
      expect(share.action.startsWith(manifest.scope)).toBe(true);
    });
  });

  describe('shortcuts', () => {
    it('offers the import box directly', () => {
      const urls = (manifest.shortcuts as { url: string }[]).map((s) => s.url);
      // ?mode=link is what opens the import box on arrival.
      expect(urls).toContain('/wardrobe/new?mode=link');
    });

    it('gives every shortcut a name and an in-scope url', () => {
      for (const shortcut of manifest.shortcuts as Record<string, string>[]) {
        expect(shortcut.name).toBeTruthy();
        expect(shortcut.url.startsWith('/')).toBe(true);
      }
    });
  });

  it('still points at icons that exist', () => {
    for (const icon of manifest.icons as { src: string }[]) {
      const file = path.join(__dirname, '..', 'public', icon.src);
      expect(fs.existsSync(file)).toBe(true);
    }
  });
});

const publicFile = (src: string) => path.join(__dirname, '..', 'public', src);

describe('the identity assets', () => {
  const icons = manifest.icons as {
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }[];

  it('lists each icon once, for one purpose, with an any icon first', () => {
    // pwa-install shows icons[0]; a combined 'maskable any' crops the any icon.
    expect(icons.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ['/assets/icons/icon-192.png', '192x192', 'any'],
      ['/assets/icons/icon-512.png', '512x512', 'any'],
      ['/assets/icons/maskable-192.png', '192x192', 'maskable'],
      ['/assets/icons/maskable-512.png', '512x512', 'maskable'],
      ['/assets/icons/monochrome-512.png', '512x512', 'monochrome'],
    ]);
    expect(icons.every((i) => i.type === 'image/png')).toBe(true);
  });

  it.each(icons.map((i) => [i.src, i.sizes] as const))(
    '%s is really %s',
    async (src, sizes) => {
      const { format, width, height } = await sharp(publicFile(src)).metadata();
      expect(format).toBe('png');
      expect(`${width}x${height}`).toBe(sizes);
    },
  );

  it.each(['/assets/icons/maskable-192.png', '/assets/icons/maskable-512.png'])(
    '%s is opaque and keeps the mark inside the safe circle',
    async (src) => {
      expect((await sharp(publicFile(src)).stats()).isOpaque).toBe(true);
      const { data, info } = await sharp(publicFile(src))
        .raw()
        .toBuffer({ resolveWithObject: true });
      const c = info.width / 2;
      let farthest = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] < 128) continue;
        const p = i / info.channels;
        const d = Math.hypot(
          (p % info.width) + 0.5 - c,
          Math.floor(p / info.width) + 0.5 - c,
        );
        farthest = Math.max(farthest, d);
      }
      expect(farthest / info.width).toBeLessThan(0.4);
    },
  );

  it('paints the splash and the title bar in the page colours', () => {
    expect(manifest.theme_color).toBe('#ffffff');
    expect(manifest.background_color).toBe('#f7f8fb');
  });

  it.each([
    ['apple-touch-icon.png', 180, 180, true],
    ['assets/og-image.png', 1200, 630, true],
    ['assets/icons/badge-96.png', 96, 96, false],
  ])('%s is %dx%d', async (src, w, h, opaque) => {
    const { width, height } = await sharp(publicFile(src)).metadata();
    expect([width, height]).toEqual([w, h]);
    expect((await sharp(publicFile(src)).stats()).isOpaque).toBe(opaque);
  });

  it('carries 16, 32 and 48 px PNGs in favicon.ico', () => {
    const ico = fs.readFileSync(publicFile('favicon.ico'));
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + 16 * i;
      sizes.push(ico[entry]);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + 4).toString('hex')).toBe('89504e47');
    }
    expect([ico.readUInt16LE(2), sizes]).toEqual([1, [16, 32, 48]]);
  });

  it('lets Chromium pick the SVG favicon, which follows dark mode', () => {
    // An ICO advertising 16x16 matches the tab size exactly and wins the tie over the SVG.
    const layout = fs.readFileSync(
      path.join(__dirname, '..', 'views', 'layout.hbs'),
      'utf8',
    );
    expect(layout).toContain(
      '<link rel="icon" href="/favicon.ico" sizes="32x32" />',
    );
    expect(layout).toContain(
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    );
  });

  it('turns the tab icon light in dark mode', () => {
    expect(fs.readFileSync(publicFile('favicon.svg'), 'utf8')).toContain(
      'prefers-color-scheme: dark',
    );
  });

  it('no longer names Lazztech', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/lazztech/i);
    expect(
      fs.readdirSync(publicFile('assets')).filter((f) => /lazztech/i.test(f)),
    ).toEqual([]);
  });
});
