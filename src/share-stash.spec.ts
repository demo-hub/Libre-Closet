import {
  dropStash,
  pendingShares,
  readStash,
  stashedShareUrl,
  STASH_TTL_MS,
  stashShare,
  wasBouncedToLogin,
} from '../views/assets/share-stash';

/**
 * The stash is the only part of the service worker that can be tested at all:
 * `caches` does not exist outside a service worker and Workbox cannot be
 * required from Jest, so the module takes its CacheStorage as an argument and
 * this stands one up in memory.
 */
class FakeCache {
  private entries = new Map<string, Response>();

  put(key: string, response: Response) {
    this.entries.set(key, response);
    return Promise.resolve();
  }

  match(key: string | Request) {
    const url = typeof key === 'string' ? key : key.url;
    return Promise.resolve(
      this.entries.get(url) ??
        this.entries.get(new URL(url, 'http://x').pathname),
    );
  }

  delete(key: string | Request) {
    const url = typeof key === 'string' ? key : key.url;
    return Promise.resolve(this.entries.delete(url));
  }

  keys() {
    return Promise.resolve(
      [...this.entries.keys()].map((url) => ({ url }) as Request),
    );
  }
}

const fakeCaches = () => {
  const cache = new FakeCache();
  return {
    caches: { open: () => Promise.resolve(cache) } as unknown as CacheStorage,
    cache,
  };
};

const shareRequest = (fields: Record<string, string>, photo?: Blob) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  if (photo) body.append('photo', photo, 'coat.png');
  return new Request('http://app.test/wardrobe/import/share', {
    method: 'POST',
    body,
  });
};

const NOW = 1_700_000_000_000;

describe('stashing a share that could not be handled', () => {
  it('gives back what was shared, field for field', async () => {
    const { caches } = fakeCaches();
    await stashShare(
      caches,
      shareRequest({
        title: 'Wool Coat',
        url: 'https://shop.example/p/coat',
      }),
      NOW,
      'abc',
    );

    const stashed = await readStash(caches, 'abc', NOW);
    expect(stashed?.body.get('title')).toBe('Wool Coat');
    expect(stashed?.body.get('url')).toBe('https://shop.example/p/coat');
  });

  it('keeps the photo, which is the part that cannot be typed again', async () => {
    const { caches } = fakeCaches();
    const photo = new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], {
      type: 'image/png',
    });
    await stashShare(
      caches,
      shareRequest({ title: 'A photo' }, photo),
      NOW,
      'p1',
    );

    const stashed = await readStash(caches, 'p1', NOW);
    const file = stashed?.body.get('photo') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(await file.arrayBuffer()).toHaveProperty('byteLength', 4);
  });

  it('knows nothing about an id it was never given', async () => {
    const { caches } = fakeCaches();
    expect(await readStash(caches, 'never', NOW)).toBeUndefined();
  });

  it('forgets a share once it is taken', async () => {
    const { caches } = fakeCaches();
    await stashShare(caches, shareRequest({ title: 'Coat' }), NOW, 'abc');
    await dropStash(caches, 'abc');
    expect(await readStash(caches, 'abc', NOW)).toBeUndefined();
  });

  describe('expiry', () => {
    it('hands back a share that is still fresh', async () => {
      const { caches } = fakeCaches();
      await stashShare(caches, shareRequest({ title: 'Coat' }), NOW, 'abc');
      expect(
        await readStash(caches, 'abc', NOW + STASH_TTL_MS - 1000),
      ).toBeDefined();
    });

    it('refuses one nobody came back for, and clears it out', async () => {
      const { caches, cache } = fakeCaches();
      await stashShare(caches, shareRequest({ title: 'Coat' }), NOW, 'abc');
      const later = NOW + STASH_TTL_MS + 1;

      expect(await readStash(caches, 'abc', later)).toBeUndefined();
      // Not just hidden: a stashed photo should not outlive its usefulness.
      expect(await cache.keys()).toHaveLength(0);
    });
  });

  describe('what is still waiting', () => {
    it('lists them newest first', async () => {
      const { caches } = fakeCaches();
      await stashShare(caches, shareRequest({ title: 'One' }), NOW, 'one');
      await stashShare(
        caches,
        shareRequest({ title: 'Two' }),
        NOW + 5000,
        'two',
      );

      expect(
        (await pendingShares(caches, NOW + 6000)).map((s) => s.id),
      ).toEqual(['two', 'one']);
    });

    it('sweeps up the expired ones on the way past', async () => {
      const { caches } = fakeCaches();
      await stashShare(caches, shareRequest({ title: 'Old' }), NOW, 'old');
      await stashShare(
        caches,
        shareRequest({ title: 'New' }),
        NOW + STASH_TTL_MS,
        'new',
      );

      const pending = await pendingShares(caches, NOW + STASH_TTL_MS + 1);
      expect(pending.map((s) => s.id)).toEqual(['new']);
    });

    it('says nothing when nothing is waiting', async () => {
      const { caches } = fakeCaches();
      expect(await pendingShares(caches, NOW)).toEqual([]);
    });
  });
});

describe('stashedShareUrl', () => {
  it('sends the browser somewhere that can find the share again', () => {
    expect(stashedShareUrl('abc')).toBe('/wardrobe/new?mode=link&shared=abc');
  });

  it('encodes an id that would otherwise change the query', () => {
    expect(stashedShareUrl('a&b=c')).toContain('shared=a%26b%3Dc');
  });
});

describe('wasBouncedToLogin', () => {
  const response = (url: string, redirected: boolean, type = 'basic') =>
    ({ url, redirected, type }) as Response;

  it('recognises the login page arriving instead of the form', () => {
    // fetch follows the redirect, so what comes back IS the login page.
    expect(
      wasBouncedToLogin(response('http://app.test/auth/login', true)),
    ).toBe(true);
  });

  it('leaves an ordinary answer alone', () => {
    expect(
      wasBouncedToLogin(
        response('http://app.test/wardrobe/import/share', false),
      ),
    ).toBe(false);
  });

  it('keeps a share the worker was told nothing about', () => {
    // A navigation's own request carries redirect mode "manual", so a 3xx
    // comes back opaque: status 0, redirected false, nothing readable. All it
    // means is the share was not accepted, which is reason enough to keep it.
    expect(wasBouncedToLogin(response('', false, 'opaqueredirect'))).toBe(true);
  });

  it('survives a response whose url cannot be parsed', () => {
    expect(wasBouncedToLogin(response('', true))).toBe(false);
  });

  it('does not mistake a redirect that landed somewhere useful', () => {
    expect(
      wasBouncedToLogin(response('http://app.test/wardrobe/12', true)),
    ).toBe(false);
  });
});
