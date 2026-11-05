import { join } from 'path';
import { assetRevisions } from './asset-url';

type Entry = { url: string; revision: string };

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const workbox = require('../workbox-config.js') as {
  manifestTransforms: ((entries: Entry[]) => Promise<{ manifest: Entry[] }>)[];
};

describe('assetRevisions', () => {
  const revisions = assetRevisions(join(__dirname, '..', 'public'));

  it.each([
    '/favicon.ico',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/manifest.json',
  ])('versions %s', (path) => {
    expect(revisions.get(path)).toMatch(/^[0-9a-f]{32}$/);
  });

  // A page asking for a URL that the worker precached under another would miss the precache.
  it('versions exactly what the worker precaches with a revision', async () => {
    const entries = [...revisions.keys(), '/assets/icons/icon-192.png'].map(
      (path) => ({ url: path.slice(1), revision: 'abc' }),
    );
    const { manifest } = await workbox.manifestTransforms[0](entries);
    expect(
      manifest.filter((e) => e.url.endsWith('?v=abc')).map((e) => e.url),
    ).toEqual([...revisions.keys()].map((path) => `${path.slice(1)}?v=abc`));
  });
});
