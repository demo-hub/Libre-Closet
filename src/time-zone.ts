/** Whether this names a time zone the runtime knows. Intl takes aliases that `supportedValuesOf` leaves out. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 64) return false;
  if (!/^[A-Za-z][\w+-]*(\/[\w+-]+){0,2}$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's zone from its `tz` cookie, then the instance's `TZ` setting, then UTC. */
export function viewerTimeZone(cookie: unknown, setting?: string): string {
  if (isTimeZone(cookie)) return cookie;
  return isTimeZone(setting) ? setting : 'UTC';
}

/** The YYYY-MM-DD date it is now in `zone`. */
export function todayIn(zone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
