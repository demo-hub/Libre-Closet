/**
 * Where to send someone once they have signed in.
 *
 * The value comes off a query string, so it is attacker-supplied: a login page
 * that forwards to wherever it is told is an open redirect, and a convincing
 * one, because the user really did just authenticate.
 */

/** A path, not a URL, so anything longer than this is not one we made. */
const MAX_LENGTH = 512;

/**
 * Resolved against an origin nothing can reach. Every way of naming another
 * host — `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:` — moves
 * the result off this origin, and that is the whole test. Reasoning about the
 * shapes by hand misses one; the URL parser is the thing browsers use.
 */
const NOWHERE = 'http://return-to.invalid';

/** Signing in again is not somewhere to be returned to. */
const NOT_A_DESTINATION = /^\/auth(\/|$)/i;

export function safeReturnTo(input?: unknown): string | undefined {
  // A repeated query parameter arrives as an array, and this is a security
  // boundary reached from both a query string and a request body: it has to
  // be total over whatever turns up.
  if (typeof input !== 'string') return undefined;
  const value = input.trim();
  if (!value || value.length > MAX_LENGTH) return undefined;
  // Control characters never appear in a path we produced, and a newline in a
  // redirect is a header-splitting attempt.
  if (/\p{Cc}/u.test(value)) return undefined;
  if (!value.startsWith('/')) return undefined;

  let url: URL;
  try {
    url = new URL(value, NOWHERE);
  } catch {
    return undefined;
  }
  if (url.origin !== NOWHERE) return undefined;

  const path = `${url.pathname}${url.search}`;
  if (NOT_A_DESTINATION.test(url.pathname)) return undefined;
  // The origin check passed, but the path itself must not read as another host
  // wherever it is used next.
  if (path.startsWith('//')) return undefined;
  // The fragment is dropped: it never reaches the server anyway.
  return path;
}

/** The login URL to send someone to, remembering where they were headed. */
export function loginUrlFor(originalUrl?: string): string {
  const returnTo = safeReturnTo(originalUrl);
  return returnTo
    ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/login';
}
