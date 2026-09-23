import { PushNotificationDto } from './dto/pushNotification.dto';

/** Root-relative, so they resolve against the instance's own origin. */
export const PUSH_ICON = '/assets/icons/icon-192.png';
export const PUSH_BADGE = '/assets/icons/badge-96.png';

/** The service worker shows only `title` and `options` (views/assets/push.ts). */
export function buildPushPayload({ title, body, url }: PushNotificationDto) {
  return {
    title,
    options: {
      body,
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
      data: { url: url ?? '/wardrobe' },
    },
  };
}
