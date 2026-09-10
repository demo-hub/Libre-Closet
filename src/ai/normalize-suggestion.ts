import { GarmentCategory } from '../wardrobe/garment-category.enum';
import { GarmentColor } from '../wardrobe/garment-color.enum';
import type { EnrichmentContext, GarmentSuggestion } from './garment-enricher';

/**
 * Every provider answer passes through here before anything sees it.
 *
 * A model that was asked for a schema usually returns one, but "usually" is not
 * a guarantee worth trusting with a value that reaches a template and a
 * database: a local model behind an OpenAI-compatible endpoint can return
 * anything at all. So nothing is believed — enum membership is checked,
 * confidence is clamped, markup and links are stripped, and lengths are cut to
 * what the columns hold.
 */

const MAX_SHORT = 255;
const MAX_NOTES = 1000;
const MAX_COLORS = 3;

const KNOWN_CATEGORIES = new Set<string>(Object.values(GarmentCategory));
const KNOWN_COLORS = new Set<string>(Object.values(GarmentColor));

/** Strips anything that would render as markup or lead somewhere. */
const plain = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, max).trimEnd() : undefined;
};

const clamp = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
};

/** Matches a free-text category against the ones this wardrobe already uses. */
const matchCategory = (
  suggested: string | undefined,
  known: string[],
): string | undefined => {
  if (!suggested) return undefined;
  const wanted = suggested.trim().toLowerCase();
  if (!wanted) return undefined;
  const existing = known.find((c) => c.toLowerCase() === wanted);
  if (existing) return existing;
  return KNOWN_CATEGORIES.has(wanted) ? wanted : undefined;
};

export function normalizeSuggestion(
  raw: unknown,
  context: EnrichmentContext,
): GarmentSuggestion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const answer = raw as Record<string, unknown>;

  const colors = Array.isArray(answer.colors)
    ? [
        ...new Set(
          answer.colors
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim().toLowerCase())
            .filter((c) => KNOWN_COLORS.has(c)),
        ),
      ].slice(0, MAX_COLORS)
    : [];

  // The enum answer first, then the free-text one matched against this
  // wardrobe's own categories: a category the user already uses beats a
  // built-in guess, exactly as the extractor treats them.
  const category =
    matchCategory(
      typeof answer.category === 'string' ? answer.category : undefined,
      context.knownCategories,
    ) ??
    matchCategory(
      typeof answer.category_suggestion === 'string'
        ? answer.category_suggestion
        : undefined,
      context.knownCategories,
    );

  const confidence = (answer.confidence ?? {}) as Record<string, unknown>;
  const suggestion: GarmentSuggestion = {
    name: plain(answer.name, MAX_SHORT),
    category,
    brand: plain(answer.brand, MAX_SHORT),
    colors,
    material: plain(answer.material, MAX_SHORT),
    pattern: plain(answer.pattern, MAX_SHORT),
    notes: plain(answer.notes, MAX_NOTES),
    confidence: {
      category: clamp(confidence.category),
      colors: clamp(confidence.colors),
      brand: clamp(confidence.brand),
    },
  };

  // A brand the model was not confident about is worse than none: it is the
  // one field a user is least likely to check and most likely to keep.
  if (suggestion.confidence.brand < 0.5) suggestion.brand = undefined;

  // Only fields the form can actually offer as a button count: a suggestion
  // carrying nothing but a material renders as a heading above an empty row,
  // which reads as a broken feature rather than a quiet one.
  const saidSomething =
    suggestion.name ||
    suggestion.category ||
    suggestion.brand ||
    suggestion.colors.length ||
    suggestion.notes;
  return saidSomething ? suggestion : undefined;
}
