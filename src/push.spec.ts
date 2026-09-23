import { buildPushPayload } from './notification/push-payload';
import {
  clickTarget,
  focusOrOpen,
  notificationFromPush,
} from '../views/assets/push';

const ORIGIN = 'https://closet.example';

describe('push notifications', () => {
  it('shows what the server sends, body and icons included', () => {
    const sent = buildPushPayload({
      title: 'Libre Closet',
      body: 'Hi',
      url: '/chat',
    });
    const shown = notificationFromPush(JSON.stringify(sent), 0);
    expect(shown?.title).toBe('Libre Closet');
    expect(shown?.options).toEqual(sent.options);
  });

  it('treats plain text as the title', () => {
    expect(notificationFromPush('Hello', 0)).toEqual({
      title: 'Hello',
      options: {},
    });
  });

  it('shows nothing once expired, or for malformed JSON', () => {
    expect(
      notificationFromPush(JSON.stringify({ title: 't', expires: 5 }), 10),
    ).toBeNull();
    expect(notificationFromPush('{not json', 0)).toBeNull();
  });

  it.each([
    [{ url: '/chat' }, `${ORIGIN}/chat`],
    [{ url: `${ORIGIN}/outfits/1` }, `${ORIGIN}/outfits/1`],
    [{ url: 'https://evil.example/x' }, `${ORIGIN}/wardrobe`],
    [{ url: '//evil.example/x' }, `${ORIGIN}/wardrobe`],
    [{ url: 42 }, `${ORIGIN}/wardrobe`],
    [null, `${ORIGIN}/wardrobe`],
  ])('a click on %j opens %s', (data, href) => {
    expect(clickTarget(data, ORIGIN)).toBe(href);
  });

  const clients = (urls: string[]) => {
    const focused: string[] = [];
    const opened: string[] = [];
    return {
      focused,
      opened,
      matchAll: () =>
        Promise.resolve(
          urls.map((url) => ({
            url,
            focus: () => Promise.resolve(focused.push(url)),
          })),
        ),
      openWindow: (url: string) => Promise.resolve(opened.push(url)),
    };
  };

  it('focuses the window already on that page', async () => {
    const c = clients([`${ORIGIN}/wardrobe`, `${ORIGIN}/chat`]);
    await focusOrOpen(c, `${ORIGIN}/chat`);
    expect(c.focused).toEqual([`${ORIGIN}/chat`]);
    expect(c.opened).toEqual([]);
  });

  it('opens a new window rather than navigating another page away', async () => {
    const c = clients([`${ORIGIN}/wardrobe/new`]);
    await focusOrOpen(c, `${ORIGIN}/chat`);
    expect(c.focused).toEqual([]);
    expect(c.opened).toEqual([`${ORIGIN}/chat`]);
  });
});
