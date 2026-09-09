import { I18nContext } from 'nestjs-i18n';
import { GarmentCategory } from './garment-category.enum';
import { GarmentColor } from './garment-color.enum';
import type { GarmentService } from './garment.service';
import type { GarmentPrefill } from './import/garment-prefill';

/**
 * The variables views/wardrobe/form.hbs and its partials read. Built in one
 * place because two controllers render that view: the blank new-garment page
 * and the import route, which re-renders it prefilled.
 */
export interface GarmentFormModel {
  categories: { value: string; label: string }[];
  colors: GarmentColor[];
  customColors: string[];
  garment: Record<string, unknown>;
  viewOwner?: number;
  /** Field name → where its value came from, for the "Suggested" badges. */
  suggested?: Record<string, string>;
  sizeOptions?: string[];
  /** The import box: what was pasted, and whether it starts open. */
  importUrl?: string;
  importOpen?: boolean;
  importPreview?: { dataUri: string; hasAlpha: boolean; url: string };
  importCandidates?: { url: string; index: number }[];
  suggestedFields?: string;
  allCandidates?: string[];
  importFailure?: string;
  importedFrom?: string;
}

export async function buildFormModel(
  garmentService: GarmentService,
  i18n: I18nContext,
  owner: number | undefined,
  extra: Partial<GarmentFormModel> = {},
): Promise<GarmentFormModel> {
  const filters = await garmentService.findAvailableFilters(owner);
  const enumValues = Object.values(GarmentCategory) as string[];
  const custom = filters.categories.filter((c) => !enumValues.includes(c));
  return {
    categories: [...enumValues, ...custom].map((value) => ({
      value,
      label: garmentService.resolveCategoryLabel(value, i18n),
    })),
    colors: Object.values(GarmentColor),
    customColors: [],
    garment: {},
    ...extra,
  };
}

/** Colours the palette has no swatch for, which render as pre-checked boxes. */
export function customOf(colors: string): string[] {
  const known = new Set<string>(Object.values(GarmentColor));
  return colors
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && !known.has(c));
}

/**
 * Adapts a draft to what the form reads: colours are a comma-joined string
 * there, the way the column stores them, and the ones the palette has no
 * swatch for are rendered as pre-checked custom boxes.
 */
export function prefillToForm(prefill: GarmentPrefill): {
  garment: Record<string, unknown>;
  customColors: string[];
  suggested: Record<string, string>;
  suggestedFields: string;
  sizeOptions: string[];
} {
  const colors = [...prefill.colors, ...prefill.customColors];
  const suggested = Object.fromEntries(
    Object.entries(prefill.sources).filter(([, source]) => source),
  );
  return {
    garment: {
      name: prefill.name,
      category: prefill.category,
      brand: prefill.brand,
      color: colors.join(','),
      size: prefill.size,
      notes: prefill.notes,
      sourceUrl: prefill.sourceUrl,
    },
    customColors: prefill.customColors,
    suggested,
    // The same list in one string, so a candidate swap can post it back.
    suggestedFields: Object.keys(suggested).join(' '),
    sizeOptions: prefill.sizeOptions,
  };
}
