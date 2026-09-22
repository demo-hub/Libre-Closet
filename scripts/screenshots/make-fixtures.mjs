// Draws the garment fixtures the visual tests seed. Run: node scripts/screenshots/make-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = join(import.meta.dirname, 'fixtures');

const shapes = {
  tee: 'M30 16 L42 12 Q50 20 58 12 L70 16 L88 31 L78 43 L70 37 L70 88 L30 88 L30 37 L22 43 L12 31 Z',
  polo: 'M30 16 L42 12 L50 22 L58 12 L70 16 L88 31 L78 43 L70 37 L70 88 L30 88 L30 37 L22 43 L12 31 Z M42 12 L50 22 L46 26 L40 14 Z M58 12 L50 22 L54 26 L60 14 Z',
  overshirt: 'M32 14 L43 11 Q50 18 57 11 L68 14 L82 26 L88 80 L78 82 L70 40 L70 90 L30 90 L30 40 L22 82 L12 80 L18 26 Z',
  hoodie: 'M36 16 Q34 4 50 4 Q66 4 64 16 L70 17 L86 30 L88 82 L78 84 L71 42 L71 90 L29 90 L29 42 L22 84 L12 82 L14 30 L30 17 Z',
  jeans: 'M31 10 L69 10 L73 92 L56 92 L50 38 L44 92 L27 92 Z',
  chinos: 'M32 10 L68 10 L71 92 L55 92 L50 40 L45 92 L29 92 Z',
  shorts: 'M29 22 L71 22 L75 64 L55 64 L50 44 L45 64 L25 64 Z',
  dress: 'M41 8 L44 8 L46 20 L54 20 L56 8 L59 8 L61 30 L80 90 L20 90 L39 30 Z',
  coat: 'M34 10 L44 8 L50 30 L56 8 L66 10 L82 24 L88 86 L78 88 L72 42 L72 96 L28 96 L28 42 L22 88 L12 86 L18 24 Z',
  trainers: 'M10 60 Q12 46 28 44 L46 42 Q54 32 66 37 L82 48 Q92 52 90 62 L90 70 L10 70 Z',
  boots: 'M30 14 L54 14 L54 56 Q62 58 78 62 Q88 65 88 74 L88 82 L30 82 Z',
  tote: 'M22 40 L78 40 L74 90 L26 90 Z M36 40 Q36 16 50 16 Q64 16 64 40 L60 40 Q60 21 50 21 Q40 21 40 40 Z',
};

export const garments = [
  { file: 'white-tee.png', shape: 'tee', fill: '#f2f1ec', name: 'White tee', category: 'tops', colors: ['white'], size: 'M' },
  { file: 'navy-polo.png', shape: 'polo', fill: '#27345c', name: 'Navy polo', category: 'tops', colors: ['blue'], size: 'M' },
  { file: 'olive-overshirt.png', shape: 'overshirt', fill: '#6b6f3a', name: 'Olive overshirt', category: 'tops', colors: ['green'], size: 'L' },
  { file: 'grey-hoodie.png', shape: 'hoodie', fill: '#8e9296', name: 'Grey hoodie', category: 'tops', colors: ['grey'], size: 'L' },
  { file: 'indigo-jeans.png', shape: 'jeans', fill: '#2e4a7a', name: 'Indigo jeans', category: 'bottoms', colors: ['blue'], size: '32' },
  { file: 'stone-chinos.png', shape: 'chinos', fill: '#c9b999', name: 'Stone chinos', category: 'bottoms', colors: ['beige'], size: '32' },
  { file: 'black-shorts.png', shape: 'shorts', fill: '#242424', name: 'Black shorts', category: 'bottoms', colors: ['black'], size: 'M' },
  { file: 'red-midi-dress.png', shape: 'dress', fill: '#b3262d', name: 'Red midi dress', category: 'dresses', colors: ['red'], size: 'S' },
  { file: 'camel-coat.png', shape: 'coat', fill: '#b58a5a', name: 'Camel coat', category: 'outerwear', colors: ['brown'], size: 'M' },
  { file: 'white-trainers.png', shape: 'trainers', fill: '#efeee9', name: 'White trainers', category: 'footwear', colors: ['white'], size: '42' },
  { file: 'brown-boots.png', shape: 'boots', fill: '#6e4526', name: 'Brown boots', category: 'footwear', colors: ['brown'], size: '42' },
  { file: 'canvas-tote.png', shape: 'tote', fill: '#d8c9a6', name: 'Canvas tote', category: 'bags', colors: ['beige'], size: 'One size' },
];

const darker = (hex) => '#' + hex.slice(1).match(/../g).map((c) => Math.round(parseInt(c, 16) * 0.72).toString(16).padStart(2, '0')).join('');

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const g of garments) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="600" height="600"><path d="${shapes[g.shape]}" fill="${g.fill}" fill-rule="evenodd" stroke="${darker(g.fill)}" stroke-width="0.8" stroke-linejoin="round"/></svg>`;
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(join(dir, g.file));
  }
  writeFileSync(join(dir, 'garments.json'), JSON.stringify(garments.map(({ shape, fill, ...rest }) => rest), null, 2) + '\n');
  console.log(`${garments.length} fixtures written to ${dir}`);
}
