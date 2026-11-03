import { createECDH, randomBytes } from 'node:crypto';
import type { LookupAddress } from 'node:dns';
import webpush from 'web-push';
import { BlockedAddressError } from '../wardrobe/import/url-policy';
import { pushAgent } from './push-agent';

/** A resolver that answers every name with these addresses, never touching DNS. */
const resolvingTo =
  (...addresses: string[]) =>
  (
    _host: string,
    _options: unknown,
    callback: (err: null, addresses: LookupAddress[]) => void,
  ) =>
    callback(
      null,
      addresses.map((address) => ({
        address,
        family: address.includes(':') ? 6 : 4,
      })),
    );

describe('pushAgent', () => {
  const subscription = {
    endpoint: 'https://push.example/1',
    // A real browser key: web-push encrypts the payload before it connects.
    keys: {
      p256dh: createECDH('prime256v1').generateKeys('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };

  beforeAll(() => {
    webpush.setVapidDetails(
      'mailto:test@example.com',
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
    );
  });

  it.each<string[]>([
    ['10.0.0.5'],
    ['169.254.169.254'],
    ['::1'],
    ['93.184.215.14', '192.168.1.2'],
  ])(
    'refuses a name that resolves to %s before connecting',
    async (...addresses: string[]) => {
      const agent = pushAgent(resolvingTo(...addresses) as never);
      try {
        await expect(
          webpush.sendNotification(subscription, 'x', { agent }),
        ).rejects.toBeInstanceOf(BlockedAddressError);
      } finally {
        agent.destroy();
      }
    },
  );
});
