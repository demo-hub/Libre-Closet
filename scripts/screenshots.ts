import { spawn } from 'child_process';
import { once } from 'events';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';
import {
  chromium,
  request,
  type BrowserContextOptions,
} from '@playwright/test';
import sharp from 'sharp';
import { SEED_WEEK, seed } from './screenshots/seed';

const root = join(__dirname, '..');
const baseURL = 'http://localhost:3100';

// Slot n of index.hbs's captions, the README tables and the manifest.
const pages = [
  '/wardrobe',
  '/outfits',
  `/calendar?week=${SEED_WEEK}`,
  '/outfits/1/edit',
];

// 1179×2556 and 2560×1600, the sizes index.hbs and the manifest declare.
const devices: [string, BrowserContextOptions][] = [
  [
    'Screenshot_mobile_',
    {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  ],
  [
    'Screenshot_',
    { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  ],
];

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function capture(scheme: 'light' | 'dark', out: string): Promise<void> {
  // The visual tests' pinned Chromium, so glyphs missing from the app's fonts do not come from this machine's.
  const ws = process.env.PW_VISUAL_WS;
  const browser = ws ? await chromium.connect(ws) : await chromium.launch();
  try {
    for (const [prefix, device] of devices) {
      const context = await browser.newContext({
        ...device,
        baseURL,
        colorScheme: scheme,
        locale: 'en-GB',
        timezoneId: 'UTC',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      for (const [i, path] of pages.entries()) {
        await page.goto(path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        // Lazy images far below the fold never complete.
        await page.waitForFunction(() =>
          Array.from(document.images).every((img) => {
            const box = img.getBoundingClientRect();
            return box.width === 0 || box.top >= innerHeight || img.complete;
          }),
        );
        const png = await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
        });
        const suffix = scheme === 'dark' ? '_dark' : '';
        const file = join(out, `${prefix}${i + 1}${suffix}.webp`);
        const { size } = await sharp(png).webp({ quality: 80 }).toFile(file);
        console.log(`${file} ${size} B`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      scheme: { type: 'string', default: 'light' },
      out: { type: 'string', default: join(root, 'public/assets/screenshots') },
    },
  });
  const { scheme, out } = values;
  if (scheme !== 'light' && scheme !== 'dark') {
    throw new Error(`--scheme is light or dark, not ${scheme}`);
  }
  if (!existsSync(join(root, 'dist/main.js'))) {
    throw new Error('Nothing to photograph: run npm run build first');
  }
  if (await answers(baseURL)) {
    throw new Error(`Something already answers on ${baseURL}`);
  }
  mkdirSync(out, { recursive: true });

  const server = spawn(
    process.execPath,
    [join(root, 'scripts/screenshots/visual-server.mjs')],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const exited = once(server, 'exit');
  try {
    const deadline = Date.now() + 60_000;
    while (!(await answers(baseURL))) {
      if (server.exitCode !== null || Date.now() > deadline) {
        throw new Error(`The app did not start on ${baseURL}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const api = await request.newContext({ baseURL });
    await seed(api);
    await api.dispose();
    await capture(scheme, out);
  } finally {
    server.kill('SIGTERM');
    await exited;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
