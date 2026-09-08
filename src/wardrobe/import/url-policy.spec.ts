import {
  BlockedAddressError,
  isBlockedAddress,
  parseSafeUrl,
} from './url-policy';

describe('isBlockedAddress', () => {
  it.each([
    ['0.0.0.0', 'unspecified'],
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.100.100.200', 'carrier NAT'],
    ['192.0.2.5', 'documentation'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['::1', 'IPv6 loopback'],
    ['fd12::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex form'],
    ['64:ff9b::7f00:1', 'NAT64 loopback'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([['93.184.216.34'], ['1.1.1.1'], ['2606:4700:4700::1111']])(
    'allows public address %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it('treats anything that is not an address as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });

  it('opens private and loopback ranges for development and testing', () => {
    expect(isBlockedAddress('192.168.1.1', true)).toBe(false);
    expect(isBlockedAddress('10.1.2.3', true)).toBe(false);
    expect(isBlockedAddress('fd12::1', true)).toBe(false);
    expect(isBlockedAddress('127.0.0.1', true)).toBe(false);
    expect(isBlockedAddress('::1', true)).toBe(false);
  });

  it('never opens cloud metadata, however it is configured', () => {
    for (const allowPrivate of [false, true]) {
      expect(isBlockedAddress('169.254.169.254', allowPrivate)).toBe(true);
      expect(isBlockedAddress('100.100.100.200', allowPrivate)).toBe(true);
      expect(isBlockedAddress('0.0.0.0', allowPrivate)).toBe(true);
      expect(isBlockedAddress('64:ff9b::7f00:1', allowPrivate)).toBe(true);
    }
  });
});

describe('parseSafeUrl', () => {
  it('accepts ordinary product URLs', () => {
    expect(parseSafeUrl('https://shop.example/p/1?v=2').host).toBe(
      'shop.example',
    );
    expect(parseSafeUrl('http://shop.example:80/p').host).toBe('shop.example');
  });

  it.each([
    ['file:///etc/passwd', 'scheme'],
    ['ftp://shop.example/p', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['https://user:pw@shop.example/p', 'credentials'],
    ['https://shop.example:22/p', 'port'],
    ['https://shop.example:8080/p', 'port'],
    ['http://localhost/p', 'host'],
    ['http://api.localhost/p', 'host'],
    ['http://printer.local/p', 'host'],
    ['http://db.internal/p', 'host'],
    ['not a url', 'not a URL'],
  ])('rejects %s', (input) => {
    expect(() => parseSafeUrl(input)).toThrow(BlockedAddressError);
  });

  // WHATWG parsing normalises these to 127.0.0.1 before the literal check.
  it.each([
    'http://127.0.0.1/p',
    'http://0x7f000001/p',
    'http://2130706433/p',
    'http://127.1/p',
    'http://[::1]/p',
    'http://[::ffff:7f00:1]/p',
    'http://169.254.169.254/latest/meta-data/',
  ])('rejects the obfuscated internal address %s', (input) => {
    expect(() => parseSafeUrl(input)).toThrow(BlockedAddressError);
  });

  it('still refuses metadata when private networks are allowed', () => {
    expect(() => parseSafeUrl('http://169.254.169.254/latest/', true)).toThrow(
      BlockedAddressError,
    );
    expect(parseSafeUrl('http://192.168.1.10/p', true).hostname).toBe(
      '192.168.1.10',
    );
    expect(parseSafeUrl('http://127.0.0.1/p', true).hostname).toBe('127.0.0.1');
    // The same flag lifts the port allowlist, for fixture servers.
    expect(parseSafeUrl('http://127.0.0.1:44161/p', true).port).toBe('44161');
    expect(() => parseSafeUrl('https://shop.example:8080/p')).toThrow(
      BlockedAddressError,
    );
  });
});
