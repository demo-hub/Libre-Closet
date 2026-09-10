import { expect, test } from '@playwright/test';

/**
 * The default configuration, which is the one that matters most: with
 * AI_PROVIDER unset the feature must not exist at all — no button to press, and
 * no route behind it either.
 *
 * A configured provider cannot be exercised here without a real API key and a
 * real request to a paid host, so what a suggestion looks like is covered by
 * the unit specs instead.
 */
test('no AI button when no provider is configured', async ({ page }) => {
  await page.goto('/wardrobe/new');
  await expect(page.locator('#photoInput')).toBeVisible();
  await expect(page.locator('#aiSuggestBtn')).toHaveCount(0);
  await expect(page.locator('#aiSuggestion')).toHaveCount(0);
});

test('the analyze route does not answer when nothing is configured', async ({
  request,
}) => {
  // Not a hidden button in front of a live endpoint.
  const response = await request.post('/wardrobe/import/analyze', {
    headers: { 'Sec-Fetch-Site': 'same-origin' },
    multipart: {
      photo: {
        name: 'coat.png',
        mimeType: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    },
  });
  expect(response.status()).toBe(404);
});

test('the privacy page claims nothing about AI when there is none', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page.locator('main')).not.toContainText('Suggest details');
});
