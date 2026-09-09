/**
 * Guesses a garment's colours from its cut-out, in the browser. The cut-out is
 * the right input: the background is already gone, so what is left is cloth.
 *
 * Everything here is a suggestion the user can uncheck, so it errs towards
 * saying less: a colour has to cover a fifth of the garment to be named at all.
 */

/** Coverage a bucket needs before it is worth suggesting. */
const MIN_SHARE = 0.2;
/** Below this the pixel is edge fuzz from the cut-out, not cloth. */
const MIN_ALPHA = 128;
/** Enough detail to judge colour; small enough to stay instant. */
const SAMPLE_EDGE = 48;
const MAX_COLORS = 3;

const rgbToHsl = (r, g, b) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, saturation, lightness };
};

/**
 * The palette value one pixel belongs to. Order matters: the achromatic cases
 * have to be settled before a hue means anything, and beige and brown are
 * carved out of the orange band before it is read as orange.
 *
 * Gold and silver are never returned: they are finishes, not pixel colours,
 * and every beige or grey garment would otherwise be called gold or silver.
 */
export const colorOf = (r, g, b) => {
  const { hue, saturation, lightness } = rgbToHsl(r, g, b);

  if (lightness < 0.15) return 'black';
  if (lightness > 0.9 && saturation < 0.12) return 'white';
  if (saturation < 0.12) return 'grey';
  if (saturation < 0.45 && lightness >= 0.6 && lightness <= 0.85) {
    if (hue >= 20 && hue <= 50) return 'beige';
  }
  if (hue >= 15 && hue <= 45 && saturation > 0.2 && lightness < 0.45) {
    return 'brown';
  }

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 260) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
};

/**
 * The colours an RGBA buffer is mostly made of, largest share first. Transparent
 * pixels are not part of the garment and are not counted at all.
 */
export const bucketPixels = (data) => {
  const counts = new Map();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    opaque += 1;
    const color = colorOf(data[i], data[i + 1], data[i + 2]);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  if (!opaque) return [];

  const ranked = [...counts.entries()]
    .map(([color, count]) => ({ color, share: count / opaque }))
    .filter((bucket) => bucket.share >= MIN_SHARE)
    .sort((a, b) => b.share - a.share);

  const colors = ranked.slice(0, MAX_COLORS).map((bucket) => bucket.color);
  // Three colours each covering a fifth of it is not a three-colour garment,
  // it is a print.
  if (ranked.length >= 3) colors.unshift('pattern');
  return colors.slice(0, MAX_COLORS);
};

/** Draws the cut-out small and reads its colours. Returns [] if it cannot. */
export const suggestColorsFromBlob = async (blob) => {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_EDGE;
    canvas.height = SAMPLE_EDGE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(bitmap, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    bitmap.close?.();
    const { data } = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    return bucketPixels(data);
  } catch (err) {
    console.warn('[color-suggest] could not read the cut-out:', err);
    return [];
  }
};

/**
 * Ticks the suggested boxes, but only on a garment whose colours nobody has
 * chosen yet: a suggestion must never undo a decision the user already made.
 * The `change` event is what makes the multiselect redraw its pills.
 */
export const applyColorSuggestion = (colors, root = document) => {
  const field = root.querySelector('[data-color-field]');
  if (!field || !colors.length) return [];
  const boxes = [...field.querySelectorAll('input[name="color"]')];
  if (boxes.some((box) => box.checked)) return [];

  const applied = [];
  for (const box of boxes) {
    if (!colors.includes(box.value)) continue;
    box.checked = true;
    applied.push(box.value);
  }
  if (!applied.length) return [];

  boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
  markSuggested(field);
  return applied;
};

/**
 * The whole suggestion, for a page that has a palette to suggest into. The
 * garment page carries the same photo picker but only replaces a photo, so
 * there is nothing to fill in there and no reason to decode the cut-out.
 */
export const suggestGarmentColors = async (blob, root = document) => {
  if (!root.querySelector('[data-color-field]')) return [];
  return applyColorSuggestion(await suggestColorsFromBlob(blob), root);
};

/** The same badge the server renders for an imported field, added late. */
const markSuggested = (field) => {
  const label = field.querySelector('label.label');
  if (!label || label.querySelector('[data-suggested]')) return;
  const badge = document.createElement('span');
  badge.className = 'badge badge-ghost badge-sm ml-2';
  badge.dataset.suggested = 'colors';
  badge.textContent = field.dataset.suggestedLabel || 'Suggested';
  label.appendChild(badge);
  // Attached here rather than left to hyperscript, which only wires the
  // markup that was in the page when it loaded.
  field.addEventListener('input', () => badge.remove(), { once: true });
};

export default {
  colorOf,
  bucketPixels,
  suggestColorsFromBlob,
  applyColorSuggestion,
  suggestGarmentColors,
};
