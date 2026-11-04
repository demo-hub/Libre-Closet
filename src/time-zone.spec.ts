import { isTimeZone, todayIn, viewerTimeZone } from './time-zone';

describe('isTimeZone', () => {
  it.each(['UTC', 'Europe/Lisbon', 'America/Argentina/Salta', 'Asia/Calcutta'])(
    'accepts %s',
    (zone) => expect(isTimeZone(zone)).toBe(true),
  );

  it.each([
    '',
    'Mars/Olympus',
    '+01:00',
    '../../etc/passwd',
    'Europe/Lisbon; path=/',
    `${'a'.repeat(65)}`,
    undefined,
    7,
  ])('refuses %p', (zone) => expect(isTimeZone(zone)).toBe(false));
});

describe('viewerTimeZone', () => {
  it('takes the browser first', () => {
    expect(viewerTimeZone('Asia/Tokyo', 'Europe/Lisbon')).toBe('Asia/Tokyo');
  });

  it.each([undefined, '', 'Mars/Olympus'])(
    'falls back to the setting after a cookie of %p',
    (cookie) => {
      expect(viewerTimeZone(cookie, 'Europe/Lisbon')).toBe('Europe/Lisbon');
    },
  );

  it.each([undefined, '', 'Mars/Olympus'])(
    'falls back to UTC after a setting of %p',
    (setting) => {
      expect(viewerTimeZone(undefined, setting)).toBe('UTC');
    },
  );
});

describe('todayIn', () => {
  const lateEvening = new Date('2026-03-04T23:30:00Z');

  it.each([
    ['UTC', '2026-03-04'],
    ['Asia/Tokyo', '2026-03-05'],
    ['America/New_York', '2026-03-04'],
  ])('in %s', (zone, day) => {
    expect(todayIn(zone, lateEvening)).toBe(day);
  });

  it('is behind UTC just after midnight in the Americas', () => {
    expect(todayIn('America/New_York', new Date('2026-03-05T01:00:00Z'))).toBe(
      '2026-03-04',
    );
  });
});
