import { test as setup } from '@playwright/test';
import { seed } from '../scripts/screenshots/seed';

setup('seed a known wardrobe', async ({ request }) => {
  await seed(request);
});
