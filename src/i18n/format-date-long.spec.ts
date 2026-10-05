import { formatDateLong } from './format-date-long';

describe('formatDateLong', () => {
  const stored = new Date('2026-09-11T00:00:00.000Z');

  it('writes the day, the month in words and the year, British order in English', () => {
    expect(formatDateLong(stored, 'en')).toBe('11 September 2026');
  });

  it('writes the date the way each language does', () => {
    expect(formatDateLong(stored, 'de')).toBe('11. September 2026');
    expect(formatDateLong(stored, 'fr')).toBe('11 septembre 2026');
  });

  it('reads the stored day in UTC, whatever the server time zone', () => {
    const format = jest.spyOn(Intl, 'DateTimeFormat');
    expect(formatDateLong('2026-01-01', 'en')).toBe('1 January 2026');
    expect(format).toHaveBeenCalledWith(
      'en-GB',
      expect.objectContaining({ timeZone: 'UTC' }),
    );
    format.mockRestore();
  });

  it('gives nothing for a missing or unreadable date', () => {
    expect(formatDateLong(undefined, 'en')).toBe('');
    expect(formatDateLong(null, 'en')).toBe('');
    expect(formatDateLong('not a date', 'en')).toBe('');
  });
});
