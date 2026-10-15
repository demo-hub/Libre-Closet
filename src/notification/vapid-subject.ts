const PROJECT_URL = 'https://github.com/demo-hub/Libre-Closet';

/**
 * Who a push service can contact about this instance. web-push accepts only an
 * https: or mailto: address and throws at boot on anything else, so an unset
 * or http:// SITE_URL falls back to the operator's address, then the source.
 */
export function vapidSubject(env: {
  SITE_URL?: string;
  OPERATOR_CONTACT?: string;
  SOURCE_URL?: string;
}): string {
  const siteUrl = env.SITE_URL?.trim();
  if (siteUrl?.startsWith('https://')) return siteUrl;
  const contact = env.OPERATOR_CONTACT?.trim();
  if (contact && /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(contact)) {
    return `mailto:${contact}`;
  }
  const source = env.SOURCE_URL?.trim();
  return source?.startsWith('https://') ? source : PROJECT_URL;
}
