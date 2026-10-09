import { readFileSync } from 'fs';
import { join } from 'path';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const APP_NAME = process.env.APP_NAME || 'Boilerplate';
const PASSWORD = 'Wardrobe2026';
const coat = readFileSync(
  join(__dirname, '../scripts/screenshots/fixtures/camel-coat.png'),
);

const form = (request: APIRequestContext, path: string, fields: string[][]) =>
  request.post(path, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams(fields).toString(),
  });

/** Signs this context in as a new account; five projects share one database, so every address is new. */
async function register(request: APIRequestContext, who: string) {
  const email = `${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const response = await form(request, '/auth/register', [
    ['email', email],
    ['password', PASSWORD],
    ['confirmPassword', PASSWORD],
  ]);
  expect(response.ok()).toBeTruthy();
  return email;
}

/** Sharing management and files exist only with AUTH_ENABLED=true; the suite's own server runs without it. */
async function signInEnabled(request: APIRequestContext) {
  const response = await request.get('/wardrobe-share/manage', {
    maxRedirects: 0,
  });
  return response.status() !== 404;
}

async function createGarment(
  request: APIRequestContext,
  category: string,
  name: string,
  brand = '',
): Promise<number> {
  const response = await form(request, '/wardrobe', [
    ['category', category],
    ['name', name],
    ['brand', brand],
  ]);
  expect(response.ok()).toBeTruthy();
  return Number(new URL(response.url()).pathname.split('/').pop());
}

async function createOutfit(
  request: APIRequestContext,
  name: string,
  slots: [string, number][],
): Promise<string> {
  const response = await form(request, '/outfits', [
    ['name', name],
    ...slots.flatMap(([category, id]) => [
      ['category', category],
      ['garmentId', String(id)],
    ]),
  ]);
  expect(response.ok()).toBeTruthy();
  return new URL(response.url()).pathname;
}

/** The path of an item's share link, read from its page's Share button. */
async function shareLink(page: Page, itemPath: string): Promise<string> {
  await page.goto(itemPath);
  const url = await page
    .locator('main button[data-copy*="/share?"]')
    .getAttribute('data-copy');
  const { pathname, search } = new URL(url!);
  return pathname + search;
}

/** An invite link made through the page, as its path. */
async function createInvite(page: Page, permission = 'VIEW') {
  await page.goto('/wardrobe-share/manage');
  await page.getByLabel('Access').selectOption(permission);
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const url = await page.locator('#new-invite-link').inputValue();
  return new URL(url).pathname;
}

function stubClipboard(page: Page) {
  return page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as unknown as { copied: string }).copied = text;
          return Promise.resolve();
        },
      },
    });
  });
}

const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied?: string }).copied);

test.describe('a shared item', () => {
  test('shows a garment by name and where it came from, never its owner', async ({
    page,
    browser,
  }, info) => {
    const email = await register(page.request, 'owner');
    const name = `Shared coat ${info.project.name} ${Date.now()}`;
    const id = await createGarment(page.request, 'outerwear', name, 'Acme');
    const link = await shareLink(page, `/wardrobe/${id}`);

    const visitor = await browser.newContext();
    const shared = await visitor.newPage();
    expect((await shared.goto(link))?.status()).toBe(200);
    await expect(shared).toHaveTitle(name);
    await expect(shared.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(shared.locator('main')).toContainText('Outerwear');
    await expect(shared.locator('main')).toContainText('Acme');
    await expect(shared.locator('main')).toContainText(
      `Shared from ${APP_NAME}`,
    );
    await expect(shared.locator('body')).not.toContainText(email);
    await expect(
      shared.locator('meta[property="og:description"]'),
    ).toHaveAttribute('content', `Shared from ${APP_NAME}`);
    await expect(shared.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/share\?shareableId=.+&type=garment$/,
    );
    await visitor.close();
  });

  test('lists an outfit’s garments by name, in the order it was built', async ({
    page,
  }, info) => {
    await register(page.request, 'outfit');
    const tag = `${info.project.name} ${Date.now()}`;
    const boots = await createGarment(page.request, 'footwear', `Boots ${tag}`);
    const top = await createGarment(page.request, 'tops', '');
    const outfit = await createOutfit(page.request, '', [
      ['footwear', boots],
      ['tops', top],
    ]);

    await page.goto(await shareLink(page, outfit));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Untitled outfit',
    );
    await expect(page.locator('main li')).toHaveText([`Boots ${tag}`, 'Tops']);
  });

  test('answers 404 for a link to nothing', async ({ page }) => {
    const response = await page.goto(
      '/share?shareableId=no-such-item&type=garment',
    );
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Error 404',
    );
  });

  test.describe('in Russian at 320 px', () => {
    test.use({ locale: 'ru-RU' });

    test('a long name wraps instead of widening the page', async ({ page }) => {
      await register(page.request, 'ru');
      const id = await createGarment(
        page.request,
        'outerwear',
        `Непромокаемаякурткасвысокимворотникомисъёмнымкапюшоном${Date.now()}`,
      );
      const link = await shareLink(page, `/wardrobe/${id}`);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(link);
      await expect(page.locator('main')).toContainText('Верхняя одежда');
      await expect(page.locator('main')).toContainText(
        `Отправлено из ${APP_NAME}`,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });
  });
});

test.describe('chat', () => {
  test('names its message box and shows a message as text, not markup', async ({
    page,
  }, info) => {
    await page.addInitScript(() =>
      document.addEventListener('htmx:sseOpen', () => {
        (window as unknown as { sseOpen: boolean }).sseOpen = true;
      }),
    );
    await register(page.request, 'chat');
    await page.goto('/chat');
    await expect(page).toHaveTitle('Chat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chat');
    await page.waitForFunction(
      () => (window as unknown as { sseOpen?: boolean }).sseOpen,
    );

    const text = `<img src=x onerror="window.chatXss=1"> ${info.project.name} ${Date.now()}`;
    const box = page.getByLabel('Message');
    await box.fill(text);
    await box.press('Enter');
    await expect(page.getByRole('log')).toContainText(text);
    await expect(box).toHaveValue('');
    expect(
      await page.evaluate(
        () => (window as unknown as { chatXss?: number }).chatXss,
      ),
    ).toBeUndefined();
  });
});

test.describe('files', () => {
  test('without sign-in there is no files page, rather than a broken one', async ({
    request,
  }) => {
    test.skip(
      await signInEnabled(request),
      'needs a server with AUTH_ENABLED=false',
    );
    expect((await request.get('/file/files')).status()).toBe(404);
  });

  test.describe('with sign-in', () => {
    test.beforeEach(async ({ request }) => {
      test.skip(
        !(await signInEnabled(request)),
        'needs a server with AUTH_ENABLED=true',
      );
    });

    test('upload from the keyboard, keep the focus, and copy a file’s link', async ({
      page,
    }) => {
      await stubClipboard(page);
      await register(page.request, 'files');
      await page.goto('/file/files');
      await expect(page).toHaveTitle('Files');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Files');
      await expect(page.getByText('No files yet.')).toBeVisible();

      await page.getByLabel('Photo').setInputFiles({
        name: 'coat.png',
        mimeType: 'image/png',
        buffer: coat,
      });
      const upload = page.getByRole('button', { name: 'Upload' });
      await upload.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('img', { name: 'Uploaded image' }),
      ).toHaveCount(1);
      await expect(upload).toBeFocused();

      const copy = page.locator('main button[data-copy]');
      await expect(copy).toHaveAccessibleName('Copy link');
      await copy.click();
      await expect(copy).toHaveText('Copied');
      expect(await copied(page)).toMatch(/\/share\?shareableId=.+&type=file$/);
    });

    test('offer Share only where the browser can share', async ({ page }) => {
      await register(page.request, 'share');
      const response = await page.request.post('/file/upload', {
        multipart: {
          file: { name: 'coat.png', mimeType: 'image/png', buffer: coat },
        },
      });
      expect(response.ok()).toBeTruthy();

      await page.addInitScript(() => {
        delete (Navigator.prototype as { share?: unknown }).share;
      });
      await page.goto('/file/files');
      await expect(
        page.getByRole('img', { name: 'Uploaded image' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Share' })).toBeHidden();

      const sharing = await page.context().newPage();
      await sharing.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: (data: unknown) => {
            (window as unknown as { shared: unknown }).shared = data;
            return Promise.resolve();
          },
        });
      });
      await sharing.goto('/file/files');
      await sharing.getByRole('button', { name: 'Share' }).click();
      await expect
        .poll(() =>
          sharing.evaluate(
            () =>
              (window as unknown as { shared?: { url: string } }).shared?.url,
          ),
        )
        .toMatch(/^\/share\?shareableId=.+&type=file$/);
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });

      test('a photo still uploads', async ({ page }) => {
        await register(page.request, 'files-nojs');
        await page.goto('/file/files');
        await page.getByLabel('Photo').setInputFiles({
          name: 'coat.png',
          mimeType: 'image/png',
          buffer: coat,
        });
        await page.getByRole('button', { name: 'Upload' }).click();
        await expect(
          page.getByRole('img', { name: 'Uploaded image' }),
        ).toHaveCount(1);
      });
    });
  });
});

test.describe('an invite in German', () => {
  test.use({ locale: 'de-DE' });

  test('that does not exist says so in German', async ({ page }) => {
    await register(page.request, 'invite-de');
    await page.goto('/wardrobe-share/invite/no-such-invite');
    await expect(page).toHaveTitle('Garderoben-Einladung');
    await expect(page.getByRole('alert')).toContainText(
      'Fehler: Diese Einladung wurde nicht gefunden.',
    );
  });
});

test.describe('sharing management', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await signInEnabled(request)),
      'needs a server with AUTH_ENABLED=true',
    );
  });

  test('names every control, and an empty page says so', async ({ page }) => {
    await register(page.request, 'empty');
    await page.goto('/wardrobe-share/manage');
    await expect(page).toHaveTitle('Wardrobe sharing');
    await expect(page.getByRole('combobox', { name: 'Access' })).toHaveValue(
      'VIEW',
    );
    await expect(
      page.getByRole('button', { name: 'Create invite link' }),
    ).toBeVisible();
    await expect(page.getByText('No wardrobe shares yet.')).toBeVisible();
  });

  test('a link made from the keyboard takes the focus, is listed, and copies', async ({
    page,
  }) => {
    await stubClipboard(page);
    await register(page.request, 'keyboard');
    await page.goto('/wardrobe-share/manage');
    await page.getByLabel('Access').selectOption('MANAGE');
    await page.getByRole('button', { name: 'Create invite link' }).focus();
    await page.keyboard.press('Enter');

    const link = page.locator('#new-invite-link');
    await expect(link).toBeFocused();
    await expect(link).toHaveAccessibleName('Invite link');
    await expect(link).toHaveValue(/\/wardrobe-share\/invite\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel('Access')).toHaveValue('MANAGE');
    const listed = page.locator('main li', { hasText: 'Pending invite' });
    await expect(listed).toHaveCount(1);
    await expect(listed.locator('.badge')).toHaveText('Can edit');
    await expect(
      listed.getByRole('button', { name: 'Revoke invite' }),
    ).toBeVisible();

    const copy = page.locator('#new-invite-link + button[data-copy]');
    await copy.click();
    await expect(copy).toHaveText('Copied');
    expect(await copied(page)).toBe(await link.inputValue());
  });

  test('revoking access and leaving a wardrobe each ask first', async ({
    page,
    browser,
  }) => {
    const owner = await register(page.request, 'grantor');
    const invite = await createInvite(page);
    const friendContext = await browser.newContext();
    const friend = await friendContext.newPage();
    const friendEmail = await register(friend.request, 'grantee');
    expect((await friend.request.post(`${invite}/accept`)).ok()).toBeTruthy();

    await friend.goto('/wardrobe-share/manage');
    const leave = friend.getByRole('button', { name: 'Leave wardrobe' });
    await expect(leave).toHaveAccessibleDescription(owner);
    friend.once('dialog', (dialog) => {
      expect(dialog.message()).toBe(
        'Leave this wardrobe? You will need a new invitation to see it again.',
      );
      void dialog.dismiss();
    });
    await leave.click();
    await expect(leave).toBeVisible();

    await page.goto('/wardrobe-share/manage');
    const revoke = page.getByRole('button', { name: 'Revoke access' });
    await expect(revoke).toHaveAccessibleDescription(friendEmail);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe(
        'Revoke access? They will need a new invitation to see your wardrobe again.',
      );
      void dialog.accept();
    });
    await revoke.click();
    await expect(page.getByText(friendEmail)).toHaveCount(0);
    await friendContext.close();
  });

  test('accepting your own invite says why, and only known errors show', async ({
    page,
  }) => {
    await register(page.request, 'self');
    const invite = await createInvite(page);
    await page.goto(invite);
    await page.getByRole('button', { name: 'Accept' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('this is your own invitation');
    await expect(alert).toBeFocused();

    await page.goto(
      '/wardrobe-share/manage?error=Your+session+expired.+Sign+in+at+evil.example',
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('an invite link is still made and listed', async ({ page }) => {
      await register(page.request, 'nojs');
      await page.goto('/wardrobe-share/manage');
      await page.getByRole('button', { name: 'Create invite link' }).click();
      await expect(
        page.locator('main li', { hasText: 'Pending invite' }),
      ).toHaveCount(1);
    });
  });

  test.describe('in German at 320 px', () => {
    test.use({ locale: 'de-DE' });

    test('every row fits', async ({ page, browser }) => {
      await register(page.request, 'de-owner');
      await createInvite(page);
      const invite = await createInvite(page, 'MANAGE');
      const friendContext = await browser.newContext({ locale: 'de-DE' });
      const friend = await friendContext.newPage();
      await register(friend.request, 'de-friend');
      expect((await friend.request.post(`${invite}/accept`)).ok()).toBeTruthy();
      const back = await createInvite(friend);
      expect((await page.request.post(`${back}/accept`)).ok()).toBeTruthy();
      await friendContext.close();

      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto('/wardrobe-share/manage');
      await expect(
        page.getByRole('button', { name: 'Garderobe verlassen' }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
    });
  });
});
