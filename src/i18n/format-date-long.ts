import { intlLocale } from './intl-locale';

// Dates without a time are stored at UTC midnight; any other zone could show the day before.
const LONG_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};

/** A date for people to read ("11 September 2026"), or '' when there is none. */
export function formatDateLong(
  date: string | Date | null | undefined,
  lang: string,
): string {
  if (!date) return '';
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(lang), LONG_DATE).format(value);
}
