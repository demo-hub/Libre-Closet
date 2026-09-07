import { test, expect } from '@playwright/test';
import sharp from 'sharp';

/**
 * Photo-first creation: the new-garment form carries the same photo picker as
 * the garment page (camera contract from lazztech/Libre-Closet#99) and saves
 * fields and photo in one request. Background removal stays off so the model
 * is never downloaded in CI, which also exercises the empty nobgPhoto part.
 */
test('new garment form takes a photo and saves it with the garment', async ({
  page,
}) => {
  const email = `photo-${Date.now()}@example.com`;
  const password = 'Password123!';
  await page.request.post('/auth/register', {
    form: { email, password, confirmPassword: password },
  });

  await page.goto('/wardrobe/new');

  const captureButton = page.locator('#photoCaptureBtn');
  await expect(captureButton).toBeVisible();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    captureButton.click(),
  ]);
  const captureInput = fileChooser.element();
  expect(await captureInput.getAttribute('capture')).toBe('environment');
  expect(await captureInput.getAttribute('accept')).toMatch(/image/);
  expect(fileChooser.isMultiple()).toBe(false);
  await expect(page.locator('#photoInput')).not.toHaveAttribute('capture');

  await page.locator('#bgRemovalToggle').uncheck();
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#c02020' },
  })
    .png()
    .toBuffer();
  await page
    .locator('#photoInput')
    .setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#photoPreview')).toBeVisible();

  await page.locator('input[name="category"]').fill('tops');
  await page.locator('#saveBtn').click();

  await expect(page).toHaveURL(/\/wardrobe\/\d+/);
  const photo = page.locator('main img[src^="/file/nobg/"]');
  await expect(photo).toBeVisible();
  const firstSrc = await photo.getAttribute('src');

  // Replacing the photo on the garment page with the toggle still off.
  await page
    .locator('#photoInput')
    .setInputFiles({ name: 'tee2.png', mimeType: 'image/png', buffer: png });
  await page.locator('#photoBtn').click();
  await expect(page.locator('#photo-saved-toast')).toBeVisible();
  await expect(photo).not.toHaveAttribute('src', firstSrc!);
});
