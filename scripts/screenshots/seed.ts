import type { APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

type Fixture = {
  file: string;
  name: string;
  category: string;
  colors: string[];
  size: string;
};

/** The week the calendar snapshots show: in the past, so it never contains today. */
export const SEED_WEEK = '2026-03-01';

const fixtures = join(__dirname, 'fixtures');

async function ok(
  what: string,
  response: Awaited<ReturnType<APIRequestContext['post']>>,
) {
  if (!response.ok()) {
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  }
}

/** Needs an empty database: the outfits and the worn toggle rely on ids 1–12 and 1. */
export async function seed(request: APIRequestContext): Promise<void> {
  const garments = JSON.parse(
    readFileSync(join(fixtures, 'garments.json'), 'utf8'),
  ) as Fixture[];

  for (const g of garments) {
    const photo = readFileSync(join(fixtures, g.file));
    // Text parts must precede the files: the route reads the stream in order.
    const form = new FormData();
    form.append('name', g.name);
    form.append('category', g.category);
    for (const c of g.colors) form.append('color', c);
    form.append('size', g.size);
    // The photo is already cut out, so it is its own background-removed copy.
    form.append('photo', new Blob([photo], { type: 'image/png' }), g.file);
    form.append('nobgPhoto', new Blob([photo], { type: 'image/png' }), g.file);
    await ok(
      g.name,
      await request.post('/wardrobe/import', { multipart: form }),
    );
  }

  const outfits: [string, string | null, [string, number][]][] = [
    [
      'Office Monday',
      '2026-03-02',
      [
        ['tops', 2],
        ['bottoms', 6],
        ['footwear', 11],
      ],
    ],
    [
      'Weekend walk',
      '2026-03-04',
      [
        ['tops', 4],
        ['bottoms', 5],
        ['footwear', 10],
        ['bags', 12],
      ],
    ],
    [
      'Dinner out',
      '2026-03-06',
      [
        ['dresses', 8],
        ['outerwear', 9],
        ['footwear', 11],
      ],
    ],
    [
      'Summer errand',
      null,
      [
        ['tops', 1],
        ['bottoms', 7],
        ['footwear', 10],
      ],
    ],
  ];
  for (const [name, scheduleDate, slots] of outfits) {
    const body = new URLSearchParams({ name });
    if (scheduleDate) body.append('scheduleDate', scheduleDate);
    for (const [category, garmentId] of slots) {
      body.append('category', category);
      body.append('garmentId', String(garmentId));
    }
    await ok(
      name,
      await request.post('/outfits', {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: body.toString(),
      }),
    );
  }

  await ok(
    'worn',
    await request.post('/calendar/1/worn', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: `week=${SEED_WEEK}`,
    }),
  );
}
