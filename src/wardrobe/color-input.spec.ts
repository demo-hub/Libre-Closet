import { normalizeColorInput } from './color-input';

describe('normalizeColorInput', () => {
  it('joins repeated checkbox values', () => {
    expect(normalizeColorInput(['red', 'blue'])).toBe('red,blue');
  });

  it('trims and drops blanks from a comma string', () => {
    expect(normalizeColorInput(' red, blue ,,')).toBe('red,blue');
  });

  it('returns an empty string when nothing was chosen', () => {
    expect(normalizeColorInput(undefined)).toBe('');
    expect(normalizeColorInput('')).toBe('');
  });
});
