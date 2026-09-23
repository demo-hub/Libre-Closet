// Rasterises design/libre-closet-mark.svg, og-image.svg and social-preview.svg into the committed icon set. Run: node scripts/build-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const colour = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'src/brand/tokens.json'), 'utf8')).colours.map((c) => [c.id, c.value.hex]),
);
const paths = [...readFileSync(join(root, 'design/libre-closet-mark.svg'), 'utf8').matchAll(/<path d="([^"]+)"/g)].map(
  (m) => m[1],
);

// The mark's ink at stroke 2 spans x 3–21 and y 2–18.5, so it is centred on (12, 10.25), not on (12, 12).
const INK_CENTRE = [12, 10.25];

function markGroup({ box, cx, cy, stroke, width = 2 }) {
  const s = box / 24;
  const tx = cx - INK_CENTRE[0] * s;
  const ty = cy - INK_CENTRE[1] * s;
  const d = paths.map((p) => `<path d="${p}"/>`).join('');
  return `<g transform="translate(${tx} ${ty}) scale(${s})" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
}

function svg(size, body, background = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}${body}</svg>`;
}

async function png(svgText, out, { opaque = false } = {}) {
  let img = sharp(Buffer.from(svgText));
  if (opaque) img = img.removeAlpha();
  const buf = await img.png({ compressionLevel: 9 }).toBuffer();
  if (out) writeFileSync(join(root, out), buf);
  return buf;
}

// Favicons sit 2 units lower than centred, which lands the bar on whole pixels at 16 and 48.
function favicon(size, width) {
  const s = size / 24;
  const d = paths.map((p) => `<path d="${p}"/>`).join('');
  return svg(
    size,
    `<g transform="translate(0 ${2 * s}) scale(${s})" fill="none" stroke="${colour.ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`,
  );
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e);
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

mkdirSync(join(root, 'public/assets/icons'), { recursive: true });

const faviconSvg = favicon(24, 2).replace(
  '<g',
  `<style>@media (prefers-color-scheme: dark){path{stroke:${colour['dark-text']}}}</style><g`,
);
writeFileSync(join(root, 'public/favicon.svg'), faviconSvg + '\n');

const icoImages = [];
for (const [size, width] of [
  [16, 3],
  [32, 2],
  [48, 2],
]) {
  icoImages.push({ size, data: await png(favicon(size, width)) });
}
writeFileSync(join(root, 'public/favicon.ico'), ico(icoImages));

const inkTile = (size) => `<rect width="${size}" height="${size}" fill="${colour.ink}"/>`;
const roundedInkTile = (size) => `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${colour.ink}"/>`;

await png(
  svg(180, markGroup({ box: 144, cx: 90, cy: 90, stroke: colour.white }), inkTile(180)),
  'public/apple-touch-icon.png',
  { opaque: true },
);

for (const size of [192, 512]) {
  const c = size / 2;
  await png(
    svg(size, markGroup({ box: size * 0.8, cx: c, cy: c, stroke: colour.white }), roundedInkTile(size)),
    `public/assets/icons/icon-${size}.png`,
  );
  // Two thirds of the tile keeps the mark's farthest ink inside the 40 % safe circle of a maskable icon.
  await png(
    svg(size, markGroup({ box: (size * 2) / 3, cx: c, cy: c, stroke: colour.white }), inkTile(size)),
    `public/assets/icons/maskable-${size}.png`,
    { opaque: true },
  );
}

await png(
  svg(512, markGroup({ box: 512 * (2 / 3), cx: 256, cy: 256, stroke: colour.white })),
  'public/assets/icons/monochrome-512.png',
);
await png(svg(96, markGroup({ box: 96, cx: 48, cy: 48, stroke: colour.white })), 'public/assets/icons/badge-96.png');

// The preview SVGs embed the mark next to their outlined text; redraw it from the source before rasterising.
const MARK_GROUP = /(<g transform="[^"]*" fill="none" stroke="[^"]*" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">)(?:<path d="[^"]+"\/>)+(<\/g>)/;
for (const [source, out] of [
  ['design/og-image.svg', 'public/assets/og-image.png'],
  ['design/social-preview.svg', 'design/social-preview.png'],
]) {
  const text = readFileSync(join(root, source), 'utf8');
  if (!MARK_GROUP.test(text)) throw new Error(`no mark group in ${source}`);
  const redrawn = text.replace(MARK_GROUP, `$1${paths.map((p) => `<path d="${p}"/>`).join('')}$2`);
  writeFileSync(join(root, source), redrawn);
  await png(redrawn, out, { opaque: true });
}

console.log('icons written');
