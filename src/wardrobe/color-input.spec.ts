import {
  MAX_COLOR_LENGTH,
  MAX_COLORS,
  normalizeColorInput,
} from './color-input';
import { GarmentColor } from './garment-color.enum';

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
    expect(normalizeColorInput([])).toBe('');
  });

  it('stores a known colour as its enum value, whatever its case', () => {
    expect(normalizeColorInput('Red, BLUE ,Grey')).toBe('red,blue,grey');
  });

  it('keeps a custom colour as typed, with its spaces collapsed', () => {
    expect(normalizeColorInput(['Navy   blue', ' Teal '])).toBe(
      'Navy blue,Teal',
    );
  });

  it('drops repeats in any case, keeping the first', () => {
    expect(normalizeColorInput('red,Red,RED,navy,Navy')).toBe('red,navy');
  });

  it('splits a comma inside one checkbox value', () => {
    expect(normalizeColorInput(['red', 'blue,green'])).toBe('red,blue,green');
  });

  it('removes markup, and drops an item that was only markup', () => {
    expect(
      normalizeColorInput('<b>teal</b>,<script>x</script>,<img src=x>,a<b'),
    ).toBe('teal,x,ab');
  });

  it(`cuts an item at ${MAX_COLOR_LENGTH} characters`, () => {
    const long = 'a'.repeat(MAX_COLOR_LENGTH + 10);
    expect(normalizeColorInput(long)).toBe('a'.repeat(MAX_COLOR_LENGTH));
  });

  it(`keeps at most ${MAX_COLORS} colours`, () => {
    const many = Array.from({ length: MAX_COLORS + 5 }, (_, i) => `c${i}`);
    expect(normalizeColorInput(many).split(',')).toHaveLength(MAX_COLORS);
  });

  it('never splits an emoji when it cuts', () => {
    const cut = normalizeColorInput(`${'x'.repeat(MAX_COLOR_LENGTH - 1)}🎨🎨`);
    expect(cut).toBe(`${'x'.repeat(MAX_COLOR_LENGTH - 1)}🎨`);
  });

  it('keeps every known colour when all are ticked', () => {
    const all = normalizeColorInput(Object.values(GarmentColor));
    expect(all.split(',')).toHaveLength(Object.values(GarmentColor).length);
  });

  it('gives the same answer for its own output', () => {
    const once = normalizeColorInput(' Red, navy , <i>Teal</i>,red');
    expect(normalizeColorInput(once)).toBe(once);
  });
});
