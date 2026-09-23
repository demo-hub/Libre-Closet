// Browser globals are passed in, so src/push.spec.ts can run this without a service worker.

export interface PushNotification {
  title: string;
  options: NotificationOptions;
}

/** Plain text is the title; JSON carries title, options and an optional expiry. Null means show nothing. */
export function notificationFromPush(
  text: string,
  now: number,
): PushNotification | null {
  if (!text.startsWith('{')) return { title: text, options: {} };
  let data: { title?: string; options?: NotificationOptions; expires?: number };
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data.expires && now > data.expires) return null;
  return { title: data.title ?? '', options: { ...data.options } };
}

/** Only this origin: a push payload must not be able to open another site. */
export function clickTarget(data: unknown, origin: string): string {
  const url = (data as { url?: unknown } | null)?.url;
  const fallback = new URL('/wardrobe', origin).href;
  if (typeof url !== 'string') return fallback;
  try {
    const target = new URL(url, origin);
    return target.origin === origin ? target.href : fallback;
  } catch {
    return fallback;
  }
}

interface WindowLike {
  url: string;
  focus(): Promise<unknown>;
}

interface ClientsLike {
  matchAll(options: {
    type: 'window';
    includeUncontrolled: boolean;
  }): Promise<readonly WindowLike[]>;
  openWindow(url: string): Promise<unknown>;
}

/** Another open window is never navigated away, since it may hold an unsaved form. */
export async function focusOrOpen(
  clients: ClientsLike,
  href: string,
): Promise<unknown> {
  const windows = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  const open = windows.find((w) => w.url === href);
  return open ? open.focus() : clients.openWindow(href);
}
