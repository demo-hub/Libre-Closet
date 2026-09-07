import { test, expect } from '@playwright/test';
import sharp from 'sharp';

/**
 * Photo-first creation: the new-garment form carries the same photo picker as
 * the garment page (camera contract from lazztech/Libre-Closet#99) and saves
 * fields and photo in one request. Background removal stays off so the model
 * is never downloaded in CI.
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
  const served = await page.request.get(firstSrc!);
  expect(served.status()).toBe(200);
  expect((await served.body()).length).toBeGreaterThan(0);

  // Replacing the photo on the garment page with the toggle still off.
  await page
    .locator('#photoInput')
    .setInputFiles({ name: 'tee2.png', mimeType: 'image/png', buffer: png });
  // Enabled by the picker's change handler, so this also waits for its wiring.
  await expect(page.locator('#photoBtn')).toBeEnabled();
  await page.locator('#photoBtn').click();
  await expect(page.locator('#photo-saved-toast')).toBeVisible();
  await expect(photo).not.toHaveAttribute('src', firstSrc!);
});

/**
 * The mask editor resolves only from its Accept and Skip buttons, so a native
 * dismissal (Escape, backdrop) used to leave the caller awaiting forever and
 * the new-garment Save button disabled with the form's contents stranded.
 */
test('dismissing the mask editor settles it like Skip', async ({ page }) => {
  await page.goto('/wardrobe/new');

  await page.evaluate(async () => {
    const { openMaskEditor } = await import('/js/mask-editor.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const original = new File([blob], 'original.png', { type: 'image/png' });
    (window as unknown as { maskSettled: boolean }).maskSettled = false;
    void openMaskEditor(original, blob).then(() => {
      (window as unknown as { maskSettled: boolean }).maskSettled = true;
    });
  });

  await expect(page.locator('#maskEditorDialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { maskSettled: boolean }).maskSettled,
      ),
    )
    .toBe(true);
});
