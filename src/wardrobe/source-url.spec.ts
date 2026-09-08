import { sanitizeSourceUrl, sourceUrlHost } from './source-url';

describe('sanitizeSourceUrl', () => {
  it('keeps http and https links', () => {
    expect(sanitizeSourceUrl('https://shop.example/p/1?v=2')).toBe(
      'https://shop.example/p/1?v=2',
    );
    expect(sanitizeSourceUrl('  http://shop.example/p  ')).toBe(
      'http://shop.example/p',
    );
  });

  it('drops schemes that must never reach an href', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://shop.example/p',
    ]) {
      expect(sanitizeSourceUrl(value)).toBeUndefined();
    }
  });

  it('drops anything that is not a URL', () => {
    expect(sanitizeSourceUrl('shop.example/p')).toBeUndefined();
    expect(sanitizeSourceUrl('')).toBeUndefined();
    expect(sanitizeSourceUrl('   ')).toBeUndefined();
    expect(sanitizeSourceUrl(undefined)).toBeUndefined();
  });

  it('drops links too long for the column', () => {
    expect(
      sanitizeSourceUrl(`https://shop.example/${'p'.repeat(2048)}`),
    ).toBeUndefined();
  });
});

describe('sourceUrlHost', () => {
  it('labels the link with its host', () => {
    expect(sourceUrlHost('https://www.shop.example/p/1')).toBe(
      'www.shop.example',
    );
    expect(sourceUrlHost('https://shop.example:8443/p')).toBe(
      'shop.example:8443',
    );
  });

  it('has no label for a link that would not be rendered', () => {
    expect(sourceUrlHost('javascript:alert(1)')).toBeUndefined();
    expect(sourceUrlHost(undefined)).toBeUndefined();
  });
});
