/** The app's English is British, so Intl gets en-GB for it ("11 September 2026", not "September 11, 2026"). */
export function intlLocale(lang: string): string {
  return lang === 'en' ? 'en-GB' : lang;
}
