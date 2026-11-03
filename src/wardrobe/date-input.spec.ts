import { BadRequestException } from '@nestjs/common';
import { parseDateInput } from './date-input';

describe('parseDateInput', () => {
  it('reads a date input as UTC midnight, as new Date() did', () => {
    expect(parseDateInput('2026-11-03', 'date')).toEqual(
      new Date('2026-11-03'),
    );
  });

  it('takes an empty value as no date', () => {
    expect(parseDateInput(undefined, 'date')).toBeUndefined();
    expect(parseDateInput(null, 'date')).toBeUndefined();
    expect(parseDateInput('', 'date')).toBeUndefined();
  });

  const unreadable: unknown[] = [
    'garbage',
    '2026-02-30',
    '2026-13-01',
    '03/11/2026',
    '2026-11-03T10:00:00Z',
    ' 2026-11-03',
    ['2026-11-03', '2026-11-04'],
    20261103,
  ];
  for (const value of unreadable) {
    it(`answers 400 for ${JSON.stringify(value)}`, () => {
      expect(() => parseDateInput(value, 'scheduleDate')).toThrow(
        new BadRequestException('scheduleDate must be a date (YYYY-MM-DD)'),
      );
    });
  }
});
