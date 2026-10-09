import type { I18nContext } from 'nestjs-i18n';
import { GarmentCategory } from './garment-category.enum';

/** A category in the reader's language; a category the user typed is shown as typed. */
export function resolveCategoryLabel(value: string, i18n: I18nContext): string {
  const normalized = value.toLowerCase();
  if ((Object.values(GarmentCategory) as string[]).includes(normalized)) {
    return i18n.t(`lang.CATEGORY_${normalized.toUpperCase()}`);
  }
  return value;
}
