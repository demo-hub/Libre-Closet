import webpush from 'web-push';
import { vapidSubject } from './vapid-subject';

const KEYS = {
  publicKey:
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
};

describe('vapidSubject', () => {
  it('is SITE_URL when it is https', () => {
    expect(vapidSubject({ SITE_URL: 'https://closet.example' })).toBe(
      'https://closet.example',
    );
  });

  it('falls back to the operator’s address, then the source', () => {
    for (const SITE_URL of [undefined, '', 'http://192.168.1.10:3000']) {
      expect(
        vapidSubject({ SITE_URL, OPERATOR_CONTACT: ' jane@example.com ' }),
      ).toBe('mailto:jane@example.com');
      expect(
        vapidSubject({
          SITE_URL,
          OPERATOR_CONTACT: 'https://example.com/contact',
          SOURCE_URL: 'https://git.example/closet',
        }),
      ).toBe('https://git.example/closet');
      expect(vapidSubject({ SITE_URL, SOURCE_URL: 'http://git.lan' })).toBe(
        'https://github.com/demo-hub/Libre-Closet',
      );
    }
  });

  it('is always a subject web-push accepts', () => {
    for (const env of [
      {},
      { SITE_URL: '' },
      { SITE_URL: 'http://192.168.1.10:3000' },
      { SITE_URL: 'http://192.168.1.10:3000', OPERATOR_CONTACT: 'Jane' },
    ]) {
      expect(() =>
        webpush.setVapidDetails(
          vapidSubject(env),
          KEYS.publicKey,
          KEYS.privateKey,
        ),
      ).not.toThrow();
    }
  });
});
