import { expect, test, type Page } from '@playwright/test';

/**
 * The first page view after an upgrade, with the previous release's service
 * worker still in control.
 *
 * PWA_ENABLED is false here, so nothing registers the worker; these tests do it
 * themselves. /sw.js is built and served either way. Routing a worker's own
 * script and its fetches needs Chromium.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'routing a service worker needs Chromium',
);

/** Registers /sw.js and waits until it has precached and controls the page. */
const registerWorker = async (page: Page) => {
  await page.goto('/about');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
};

/** Replaces every precached copy of `path`, whatever its query, with `body`. */
const poisonPrecache = (page: Page, path: string, body: string, type: string) =>
  page.evaluate(
    async ({ path, body, type }) => {
      let replaced = 0;
      for (const name of await caches.keys()) {
        if (!name.startsWith('workbox-precache')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname !== path) continue;
          await cache.put(
            request,
            new Response(body, { headers: { 'Content-Type': type } }),
          );
          replaced++;
        }
      }
      return replaced;
    },
    { path, body, type },
  );

const STALE_CSS = ':root{--stale-build:1}';
const STALE_MODULE = 'export const staleBuild = true;';

test('a previous release’s precache cannot answer the page’s stylesheet or modules', async ({
  context,
  page,
}) => {
  // The worker as a release before versioned URLs built it: the same workbox
  // code, with the stylesheet and scripts precached under their bare URLs.
  await context.route('**/sw.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /"url":"(bundle\.css|js\/[^"?]+\.js)\?v=[0-9a-f]+"/g,
      '"url":"$1"',
    );
    await route.fulfill({ response, body });
  });
  await registerWorker(page);

  // Its precache holds that release's files.
  expect(
    await poisonPrecache(page, '/bundle.css', STALE_CSS, 'text/css'),
  ).toBeGreaterThan(0);
  expect(
    await poisonPrecache(
      page,
      '/js/share-stash.js',
      STALE_MODULE,
      'text/javascript',
    ),
  ).toBeGreaterThan(0);
  // And answers the bare URLs from it, which is what the pages used to ask for.
  expect(
    await page.evaluate(() => fetch('/bundle.css').then((r) => r.text())),
  ).toBe(STALE_CSS);

  // The upgrade's first page view: the HTML comes from the network.
  await page.reload();

  // The current stylesheet: it lays the body out as a column, the stale one does not.
  await expect(page.locator('body')).toHaveCSS('display', 'flex');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--stale-build',
      ),
    ),
  ).toBe('');
  expect(
    await page.locator('link[rel="stylesheet"]').getAttribute('href'),
  ).toMatch(/^\/bundle\.css\?v=[0-9a-f]{32}$/);

  // A bare module import goes through the import map to this build's URL.
  const exports = await page.evaluate(async () =>
    Object.keys((await import('/js/share-stash.js')) as object),
  );
  expect(exports).toContain('describePending');
  expect(exports).not.toContain('staleBuild');
});

test('the current worker precaches exactly the URLs the page asks for', async ({
  page,
}) => {
  await registerWorker(page);
  await page.reload();

  const asked = await page.evaluate(() => {
    const map = JSON.parse(
      document.querySelector('script[type="importmap"]')!.textContent,
    ) as { imports: Record<string, string> };
    return [
      document.querySelector('link[rel="stylesheet"]')!.getAttribute('href')!,
      ...Object.entries(map.imports)
        .filter(([key]) => key.startsWith('/js/'))
        .map(([, url]) => url),
    ];
  });
  // The server's hash and workbox's agree, or every one of these misses the
  // precache: online nobody would notice, offline the page has no styles.
  expect(asked.length).toBeGreaterThan(1);
  for (const url of asked) expect(url).toMatch(/\?v=[0-9a-f]{32}$/);

  const precached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith('workbox-precache')) continue;
      for (const request of await (await caches.open(name)).keys()) {
        const url = new URL(request.url);
        url.searchParams.delete('__WB_REVISION__');
        urls.push(url.pathname + url.search);
      }
    }
    return urls;
  });
  expect(precached).toEqual(expect.arrayContaining(asked));
});
