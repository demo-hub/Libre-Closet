import * as fs from 'node:fs';
import * as path from 'node:path';

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
