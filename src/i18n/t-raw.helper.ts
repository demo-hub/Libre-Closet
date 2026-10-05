import type { HelperOptions } from 'handlebars';
import type { I18nService } from 'nestjs-i18n';

/** A value with its `{placeholders}` intact, for client code to fill; `{{t}}` blanks them. */
export function tRawHelper(i18n: I18nService) {
  return function (key: string, options: HelperOptions): string {
    const { root } = options.data as { root?: { i18nLang?: string } };
    return String(i18n.t(key, { lang: root?.i18nLang }));
  };
}
