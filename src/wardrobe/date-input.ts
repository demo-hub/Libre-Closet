import { BadRequestException } from '@nestjs/common';

/**
 * A calendar day as a date input sends it (YYYY-MM-DD), as UTC midnight, the
 * same Date `new Date('YYYY-MM-DD')` gave before. Empty means no date. Anything
 * else answers 400 here, before the caller stores a photo or a row: it used to
 * reach the database as an Invalid Date and answer 500, after an outfit had
 * already been saved.
 */
export function parseDateInput(
  value: unknown,
  field: string,
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    // Round-tripped, so 2026-02-30 does not roll over into March.
    if (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ) {
      return date;
    }
  }
  throw new BadRequestException(`${field} must be a date (YYYY-MM-DD)`);
}
