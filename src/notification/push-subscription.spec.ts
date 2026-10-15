import { pushSubscriptionFrom } from './push-subscription';

const keys = {
  p256dh:
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

describe('pushSubscriptionFrom', () => {
  it('takes what a browser sends', () => {
    const body = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      expirationTime: null,
      keys,
    };
    expect(pushSubscriptionFrom(body)).toEqual({
      endpoint: body.endpoint,
      keys,
    });
  });

  it.each([
    ['nothing', undefined],
    ['no endpoint', { keys }],
    ['plain http', { endpoint: 'http://push.example/1', keys }],
    ['loopback', { endpoint: 'https://127.0.0.1/1', keys }],
    ['localhost', { endpoint: 'https://localhost/1', keys }],
    ['a private address', { endpoint: 'https://192.168.1.10/1', keys }],
    ['cloud metadata', { endpoint: 'https://169.254.169.254/latest', keys }],
    ['an odd port', { endpoint: 'https://push.example:6379/1', keys }],
    ['no keys', { endpoint: 'https://push.example/1' }],
    [
      'a key that is not base64url',
      { endpoint: 'https://push.example/1', keys: { ...keys, auth: '<b>' } },
    ],
  ])('refuses %s', (_, body) => {
    expect(pushSubscriptionFrom(body)).toBeNull();
  });
});
