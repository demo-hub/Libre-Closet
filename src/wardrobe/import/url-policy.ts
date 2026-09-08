import * as net from 'node:net';

/**
 * Ranges a user-supplied URL must never reach: loopback, link-local (which
 * carries cloud metadata at 169.254.169.254), private and carrier NAT space,
 * documentation and multicast blocks, and the IPv6 equivalents including
 * IPv4-mapped and NAT64 forms.
 */
const BLOCKED_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

// No ::ffff:0:0/96 entry: it would match every IPv4 address, and Node already
// tests IPv4-mapped addresses against the IPv4 rules above.
const BLOCKED_V6 = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const;

/**
 * Opened by IMPORT_ALLOW_PRIVATE_NETWORKS, which is for development, testing
 * and LAN use. Loopback is included so the fetcher can be exercised against a
 * local fixture server; link-local stays blocked either way because it carries
 * cloud metadata and nothing legitimate.
 */
const PRIVATE_V4 = new Set([
  '10.0.0.0',
  '127.0.0.0',
  '172.16.0.0',
  '192.168.0.0',
]);
const PRIVATE_V6 = new Set(['::1', 'fc00::']);

const buildList = (allowPrivate: boolean) => {
  const list = new net.BlockList();
  for (const [address, prefix] of BLOCKED_V4) {
    if (allowPrivate && PRIVATE_V4.has(address)) continue;
    list.addSubnet(address, prefix, 'ipv4');
  }
  for (const [address, prefix] of BLOCKED_V6) {
    if (allowPrivate && PRIVATE_V6.has(address)) continue;
    list.addSubnet(address, prefix, 'ipv6');
  }
  return list;
};

const LISTS = { strict: buildList(false), allowPrivate: buildList(true) };

export class BlockedAddressError extends Error {
  constructor(readonly reason: string) {
    super(`blocked: ${reason}`);
    this.name = 'BlockedAddressError';
  }
}

/** True when the literal address is one the server must not connect to. */
export function isBlockedAddress(
  address: string,
  allowPrivate = false,
): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  const list = allowPrivate ? LISTS.allowPrivate : LISTS.strict;
  // The family must match the literal, or an IPv4-mapped address slips through.
  return list.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/**
 * Validates a URL before any connection is attempted. Parsing normalises
 * obfuscated hosts (0x7f000001, 127.1, fullwidth digits) to dotted quads, so
 * the literal check below sees what the socket would actually dial.
 *
 * `allowPrivate` is the development flag: it also lifts the port allowlist,
 * without which a local fixture server on an ephemeral port is unreachable.
 */
export function parseSafeUrl(input: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedAddressError('not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedAddressError(`scheme ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new BlockedAddressError('credentials in URL');
  }
  // Restricting ports keeps the fetcher from probing internal services that
  // happen to sit on a public host, e.g. an exposed database port.
  if (!allowPrivate && url.port && url.port !== '80' && url.port !== '443') {
    throw new BlockedAddressError(`port ${url.port}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new BlockedAddressError('no host');
  if (
    host === 'localhost' ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new BlockedAddressError(`host ${host}`);
  }
  if (net.isIP(host) && isBlockedAddress(host, allowPrivate)) {
    throw new BlockedAddressError(`address ${host}`);
  }
  return url;
}
