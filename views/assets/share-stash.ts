/**
 * Keeps a share that could not be handled when it arrived.
 *
 * A share is a one-shot POST: if the session has expired the server answers a
 * redirect to the login page and the payload is gone, and offline it never
 * leaves the device at all. Either way the user watched their photo disappear.
 * So the service worker puts it here first and hands back a URL that can find
 * it again.
 *
 * Deliberately free of any Workbox import, and it never touches a global: the
 * CacheStorage is passed in. That is the only way this is testable, because
 * `caches` does not exist outside a service worker.
 */

export const STASH_CACHE = 'libre-closet-share-stash-v1';

/**
 * Cache.put refuses anything but a GET, so the share POST cannot be its own
 * key. These synthetic URLs are never fetched; they only name an entry.
 */
const KEY_PREFIX = '/__share-stash/';

/** Long enough to survive signing in again, short enough not to hoard photos. */
export const STASH_TTL_MS = 24 * 60 * 60 * 1000;

const keyFor = (id: string) => `${KEY_PREFIX}${id}`;

const idFrom = (url: string): string | undefined => {
  const at = url.indexOf(KEY_PREFIX);
  return at === -1 ? undefined : url.slice(at + KEY_PREFIX.length);
};

export interface StashedShare {
  id: string;
  storedAt: number;
  body: FormData;
}

/**
 * Stores the share and returns its id. `now` is passed in rather than read so
 * the expiry is testable.
 */
export async function stashShare(
  caches: CacheStorage,
  request: Request,
  now: number,
  id: string,
): Promise<string> {
  const cache = await caches.open(STASH_CACHE);
  const body = await request.blob();
  await cache.put(
    keyFor(id),
    new Response(body, {
      headers: {
        'content-type':
          request.headers.get('content-type') ?? 'application/octet-stream',
        'x-stashed-at': String(now),
      },
    }),
  );
  return id;
}

/** The share behind an id, or undefined once it has expired or been taken. */
export async function readStash(
  caches: CacheStorage,
  id: string,
  now: number,
): Promise<StashedShare | undefined> {
  const cache = await caches.open(STASH_CACHE);
  const response = await cache.match(keyFor(id));
  if (!response) return undefined;

  const storedAt = Number(response.headers.get('x-stashed-at') ?? 0);
  if (!storedAt || now - storedAt > STASH_TTL_MS) {
    await cache.delete(keyFor(id));
    return undefined;
  }
  return { id, storedAt, body: await response.formData() };
}

export async function dropStash(
  caches: CacheStorage,
  id: string,
): Promise<void> {
  const cache = await caches.open(STASH_CACHE);
  await cache.delete(keyFor(id));
}

/**
 * Every share still waiting, newest first, with the expired ones swept up on
 * the way past. The offline page asks this what to tell the user.
 */
export async function pendingShares(
  caches: CacheStorage,
  now: number,
): Promise<{ id: string; storedAt: number }[]> {
  const cache = await caches.open(STASH_CACHE);
  const pending: { id: string; storedAt: number }[] = [];

  for (const request of await cache.keys()) {
    const id = idFrom(request.url);
    if (!id) continue;
    const response = await cache.match(request);
    const storedAt = Number(response?.headers.get('x-stashed-at') ?? 0);
    if (!storedAt || now - storedAt > STASH_TTL_MS) {
      await cache.delete(request);
      continue;
    }
    pending.push({ id, storedAt });
  }

  return pending.sort((a, b) => b.storedAt - a.storedAt);
}

/**
 * What the offline page shows: the shares still waiting. Lives here rather
 * than beside the replay so that asking the question cannot start a replay.
 */
export const describePending = async (): Promise<
  { id: string; storedAt: number }[]
> => {
  if (typeof caches === 'undefined') return [];
  try {
    return await pendingShares(caches, Date.now());
  } catch {
    return [];
  }
};

/** Where to send the browser so the page can find the share again. */
export const stashedShareUrl = (id: string) =>
  `/wardrobe/new?mode=link&shared=${encodeURIComponent(id)}`;

/**
 * True when the server did not accept the share but bounced us to sign in.
 *
 * The caller fetches a redirect-following copy of the request, so what comes
 * back is the login page itself. An opaque redirect is counted too: a
 * navigation's own request carries redirect mode "manual", and if one ever
 * reaches here it says nothing except that the share was not accepted — which
 * is reason enough to keep it.
 */
export const wasBouncedToLogin = (response: Response): boolean => {
  if (response.type === 'opaqueredirect') return true;
  if (!response.redirected) return false;
  try {
    return new URL(response.url).pathname.startsWith('/auth/');
  } catch {
    return false;
  }
};
