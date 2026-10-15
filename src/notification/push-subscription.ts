import { type PushSubscription } from 'web-push';
import { parseSafeUrl } from '../wardrobe/import/url-policy';

const KEY = /^[A-Za-z0-9_-]{16,256}={0,2}$/;

/** An https address the server may POST to: not loopback, a private network or an odd port. */
function isPublicHttps(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    return parseSafeUrl(endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && KEY.test(value);

/**
 * The subscription a browser sent, or null. The server later POSTs to its
 * endpoint, so it must be an https address that is not loopback or a private
 * network, and carry both keys web-push encrypts with.
 */
export function pushSubscriptionFrom(body: unknown): PushSubscription | null {
  const { endpoint, keys } = (body ?? {}) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (!isPublicHttps(endpoint)) return null;
  const { p256dh, auth } = keys ?? {};
  if (!isKey(p256dh) || !isKey(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}
