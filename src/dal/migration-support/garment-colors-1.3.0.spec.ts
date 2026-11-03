import { normalizeColorInput } from '../../wardrobe/color-input';
import { normalizeGarmentColors130 } from './garment-colors-1.3.0';

/**
 * Holds only while 1.3.0's rule is the live one. When normalizeColorInput
 * changes, delete this test rather than the frozen copy: the migration must
 * keep doing what it did.
 */
describe('normalizeGarmentColors130', () => {
  it.each([
    'red,blue',
    ' Red , BLUE,red',
    '<b>Teal</b>,teal, navy  blue',
    'a<b,<img src=x>,',
    `${'x'.repeat(39)}🎨🎨`,
    Array.from({ length: 30 }, (_, i) => `c${i}`).join(','),
    '',
  ])('matches the live rule for %j', (value) => {
    expect(normalizeGarmentColors130(value)).toBe(normalizeColorInput(value));
  });
});
