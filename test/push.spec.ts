import AxeBuilder from '@axe-core/playwright';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, type Page } from '@playwright/test';

// Where scripts/e2e/accounts-server.mjs runs the app.
const ACCOUNTS_PORT = 3300;
const ACCOUNTS_DATA_PATH = join(tmpdir(), 'lc-e2e-accounts');

/**
 * Push, from the profile page to sign-out, on the server with accounts and the
 * PWA on (scripts/e2e/accounts-server.mjs). Playwright's Chromium cannot reach
 * a real push service, so the page's PushManager is a stand-in that hands out
 * an https endpoint, and a push is delivered to the service worker over the
 * DevTools protocol. src/push.spec.ts covers what a click on it opens.
 */
// The full Chromium's headless mode: the headless shell reports notifications as denied, so its service worker shows none.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}`, channel: 'chromium' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Needs the DevTools protocol',
);

const PASSWORD = 'Wardrobe2026';

/** The devices the server keeps for an account, read from its database. */
function storedEndpoints(email: string): string[] {
  const db = new Database(join(ACCOUNTS_DATA_PATH, 'sqlite3.db'), {
    readonly: true,
  });
  try {
    return db
      .prepare(
        'select d.push_endpoint as endpoint from user_device d join user u on u.id = d.user_id where u.email = ?',
      )
      .all(email)
      .map((row) => (row as { endpoint: string }).endpoint);
  } finally {
    db.close();
  }
}

/** A new account, signed in, on its profile page. */
async function register(page: Page, who: string) {
  const email = `${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const response = await page.request.post('/auth/register', {
    form: { email, password: PASSWORD, confirmPassword: PASSWORD },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  await page.goto('/auth/profile');
  return email;
}

/** A push service of our own: one https endpoint per browser, kept in localStorage. */
function standInPushService(page: Page, endpoint: string) {
  return page.addInitScript((endpoint) => {
    const stored = () => localStorage.getItem('test-push-endpoint');
    const make = (applicationServerKey: ArrayBuffer) => ({
      endpoint: stored()!,
      options: { applicationServerKey },
      toJSON: () => ({
        endpoint: stored(),
        expirationTime: null,
        keys: {
          p256dh:
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      }),
      unsubscribe: () => {
        localStorage.removeItem('test-push-endpoint');
        localStorage.removeItem('test-push-key');
        return Promise.resolve(true);
      },
    });
    const key = () =>
      Uint8Array.from(
        JSON.parse(localStorage.getItem('test-push-key')!) as number[],
      ).buffer;
    PushManager.prototype.getSubscription = function () {
      return Promise.resolve(stored() ? make(key()) : null) as never;
    };
    PushManager.prototype.subscribe = function (options) {
      const bytes = new Uint8Array(
        options!.applicationServerKey as ArrayBuffer,
      );
      localStorage.setItem('test-push-endpoint', endpoint);
      localStorage.setItem('test-push-key', JSON.stringify([...bytes]));
      return Promise.resolve(make(bytes.buffer)) as never;
    };
  }, endpoint);
}

const endpointFor = (who: string) =>
  `https://push.example/${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('push notifications', () => {
  test('turn on from the profile page, arrive, and are forgotten on sign-out', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(['notifications'], { origin: baseURL });
    const endpoint = endpointFor('on');
    await standInPushService(page, endpoint);
    const email = await register(page, 'push');

    // Reached through the menu as well as directly: boosted navigation re-runs the page's script.
    await page.goto('/wardrobe');
    await page.locator('header details summary').first().click();
    await page.getByRole('link', { name: 'Profile' }).click();
    const settings = page.getByRole('region', { name: 'Notifications' });
    const toggle = settings.getByRole('button');
    await expect(toggle).toHaveText('Turn on notifications');

    await toggle.click();
    await expect(settings.getByRole('status')).toHaveText(
      'Notifications are on in this browser.',
    );
    await expect(toggle).toHaveText('Turn off notifications');
    expect(storedEndpoints(email)).toEqual([endpoint]);

    // The server sends; the stand-in endpoint is unreachable, so nothing is forgotten.
    const sent = await page.request.post('/notification/test');
    expect(sent.ok()).toBeTruthy();
    expect(storedEndpoints(email)).toEqual([endpoint]);

    // What a push service would deliver, shown by the service worker.
    const cdp = await context.newCDPSession(page);
    const registrationId = new Promise<string>((resolve) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
        const live = registrations.find((r) => !r.isDeleted);
        if (live) resolve(live.registrationId);
      });
    });
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: new URL(baseURL!).origin,
      registrationId: await registrationId,
      data: JSON.stringify({
        title: 'Libre Closet',
        options: { body: 'Hello', data: { url: '/chat' } },
      }),
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          const shown = await registration.getNotifications();
          return shown.map((n) => [n.title, n.body]);
        }),
      )
      .toEqual([['Libre Closet', 'Hello']]);

    await page.locator('header details summary').first().click();
    await page.getByRole('link', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(
      (await context.cookies()).some((c) => c.name === 'access_token'),
    ).toBe(false);
    expect(storedEndpoints(email)).toEqual([]);
    expect(
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.pushManager.getSubscription();
      }),
    ).toBeNull();
  });

  test('turn off from the profile page', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['notifications'], { origin: baseURL });
    const endpoint = endpointFor('off');
    await standInPushService(page, endpoint);
    const email = await register(page, 'push-off');
    const settings = page.getByRole('region', { name: 'Notifications' });

    await settings
      .getByRole('button', { name: 'Turn on notifications' })
      .click();
    await expect(
      settings.getByRole('button', { name: 'Turn off notifications' }),
    ).toBeVisible();
    expect(storedEndpoints(email)).toEqual([endpoint]);

    await page.reload();
    await settings
      .getByRole('button', { name: 'Turn off notifications' })
      .click();
    await expect(settings.getByRole('status')).toHaveText(
      'Notifications are off in this browser.',
    );
    await expect(
      settings.getByRole('button', { name: 'Turn on notifications' }),
    ).toBeVisible();
    expect(storedEndpoints(email)).toEqual([]);
  });

  test('move to the account that signs in next on the same browser', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(['notifications'], { origin: baseURL });
    const endpoint = endpointFor('shared');
    await standInPushService(page, endpoint);
    const first = await register(page, 'push-first');
    const settings = page.getByRole('region', { name: 'Notifications' });
    await settings
      .getByRole('button', { name: 'Turn on notifications' })
      .click();
    await expect(settings.getByRole('status')).toHaveText(
      'Notifications are on in this browser.',
    );

    // Signed out without the page's script, so the server still has it.
    await page.goto('/auth/logout');
    const second = await register(page, 'push-second');
    await settings
      .getByRole('button', { name: 'Turn on notifications' })
      .click();
    await expect(settings.getByRole('status')).toHaveText(
      'Notifications are on in this browser.',
    );
    expect(storedEndpoints(first)).toEqual([]);
    expect(storedEndpoints(second)).toEqual([endpoint]);
  });

  test('say where to allow them when the browser blocks them', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'denied',
      });
      Notification.requestPermission = () => Promise.resolve('denied');
    });
    await register(page, 'push-blocked');
    const settings = page.getByRole('region', { name: 'Notifications' });
    await expect(settings.getByRole('status')).toHaveText(
      'This browser blocks notifications from this site. Allow them in its site settings.',
    );
    await settings
      .getByRole('button', { name: 'Turn on notifications' })
      .click();
    await expect(settings.getByRole('status')).toHaveText(
      'This browser blocks notifications from this site. Allow them in its site settings.',
    );
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the profile page with its notifications passes axe (${colorScheme})`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.emulateMedia({ colorScheme });
    await context.grantPermissions(['notifications'], { origin: baseURL });
    await standInPushService(page, endpointFor('axe'));
    await register(page, 'push-axe');
    const settings = page.getByRole('region', { name: 'Notifications' });
    await settings
      .getByRole('button', { name: 'Turn on notifications' })
      .click();
    await expect(settings.getByRole('status')).toHaveText(
      'Notifications are on in this browser.',
    );
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(
      violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
    ).toEqual([]);
  });
}

test('after a service-worker update, a search keeps its terms', async ({
  page,
}) => {
  await register(page, 'sw-update');
  await page.goto('/wardrobe');
  await page.evaluate(() => {
    const w = window as unknown as { __swUpdated: boolean; __before: boolean };
    w.__swUpdated = true;
    w.__before = true;
  });
  await page.getByRole('searchbox').fill('linen shirt');
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/[?&]keyword=linen(\+|%20)shirt/);
  // A full load, not htmx's swap: the old window is gone.
  expect(
    await page.evaluate(
      () => (window as unknown as { __before?: boolean }).__before,
    ),
  ).toBeUndefined();
  await expect(page.getByRole('searchbox')).toHaveValue('linen shirt');
});
