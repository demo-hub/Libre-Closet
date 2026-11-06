import { escapeExpression } from 'handlebars';

/**
 * A hyphen is a break point, so "AGPL-3.0" could end a line at "AGPL-". U+2011
 * would hold it together, but the Inter subsets do not draw it, so the licence
 * gets a span instead. Escapes first, so its only markup is that span: use it
 * in body text, not in a meta tag or an attribute.
 */
export function keepLicenceWhole(text: string): string {
  return escapeExpression(text).replaceAll(
    'AGPL-3.0',
    '<span class="whitespace-nowrap">AGPL-3.0</span>',
  );
}
