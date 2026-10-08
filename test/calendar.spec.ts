import {
  test,
  expect,
  type APIRequestContext,
  type TestInfo,
} from '@playwright/test';

const form = (request: APIRequestContext, path: string, fields: string[][]) =>
  request.post(path, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams(fields).toString(),
  });

/** The server keeps calendar days as UTC dates. */
const today = () => new Date().toISOString().slice(0, 10);

/** Every project writes to one database, so each test's outfit has a name of its own. */
const unique = (info: TestInfo, what: string) =>
  `${what} ${info.project.name} ${Date.now()}`;

async function schedule(request: APIRequestContext, name: string) {
  const response = await form(request, '/outfits', [
    ['name', name],
    ['scheduleDate', today()],
  ]);
  expect(response.ok()).toBeTruthy();
}

test.describe('Calendar', () => {
  test('names the week, each outfit and its controls', async ({
    page,
  }, info) => {
    const name = unique(info, 'Named');
    await schedule(page.request, name);
    await page.goto(`/calendar?week=${today()}`);

    await expect(page).toHaveTitle(/^Outfit calendar/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Outfit calendar' }),
    ).toBeAttached();
    const heading = page.locator('h2[aria-current="date"]');
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText('Today');
    await expect(
      page.locator('#cal-month a[aria-current="date"]'),
    ).toHaveAttribute('href', `/calendar?week=${today()}`);

    const day = page.getByRole('group', {
      name: (await heading.innerText()).replace(/\s+/g, ' '),
    });
    const chip = day.getByRole('group', { name, exact: true });
    await expect(chip.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      new RegExp(
        `^/outfits/\\d+/edit\\?returnTo=/calendar&returnToWeek=${today()}$`,
      ),
    );
    await expect(
      chip.getByRole('button', { name: 'Remove from calendar' }),
    ).toBeVisible();
    await expect(
      day.getByRole('link', { name: 'Build outfit' }),
    ).toHaveAttribute(
      'href',
      `/outfits/new?scheduleDate=${today()}&returnTo=/calendar`,
    );
  });

  test('marks an outfit worn and back from the keyboard', async ({
    page,
  }, info) => {
    const name = unique(info, 'Worn');
    await schedule(page.request, name);
    await page.goto(`/calendar?week=${today()}`);
    const chip = page.getByRole('group', { name, exact: true });
    const worn = chip.getByRole('button', { name: 'Worn' });
    await expect(worn).toHaveAttribute('aria-pressed', 'false');

    await worn.focus();
    await page.keyboard.press('Enter');
    await expect(worn).toHaveAttribute('aria-pressed', 'true');
    await expect(worn).toBeFocused();
    const toggle = chip.locator('form[action$="/worn"]');
    await expect(toggle).toHaveAttribute('hx-target', 'this');
    await expect(toggle).toHaveAttribute('hx-swap', /^outerHTML /);

    await page.keyboard.press('Space');
    await expect(worn).toHaveAttribute('aria-pressed', 'false');
    await expect(worn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(worn).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(worn).toHaveAttribute('aria-pressed', 'true');
  });

  test('does what an out-of-date page shows', async ({ page }, info) => {
    const name = unique(info, 'Stale');
    await schedule(page.request, name);
    await page.goto(`/calendar?week=${today()}`);
    const chip = page.getByRole('group', { name, exact: true });
    const worn = chip.getByRole('button', { name: 'Worn' });
    const action = await chip
      .locator('form[action$="/worn"]')
      .getAttribute('action');

    // Marked worn somewhere else while this page still shows it unworn.
    expect(
      (await form(page.request, action!, [['worn', 'true']])).ok(),
    ).toBeTruthy();
    await worn.click();
    await expect(worn).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(worn).toHaveAttribute('aria-pressed', 'true');
  });

  test('removes an outfit from the calendar after asking', async ({
    page,
  }, info) => {
    const name = unique(info, 'Removed');
    await schedule(page.request, name);
    await page.goto(`/calendar?week=${today()}`);
    const chip = page.getByRole('group', { name, exact: true });
    const remove = chip.getByRole('button', { name: 'Remove from calendar' });

    page.once('dialog', (dialog) => void dialog.dismiss());
    await remove.click();
    await expect(chip).toBeVisible();

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('Remove this scheduled outfit?');
      void dialog.accept();
    });
    await remove.click();
    await expect(chip).toHaveCount(0);
    await expect(page).toHaveURL(`/calendar?week=${today()}`);
  });

  test('moves by month and keeps the month open on a phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/calendar?week=2026-03-01');
    const month = page.locator('#cal-month');
    await expect(month).not.toHaveAttribute('open');
    await expect(page.locator('#cal-month-label')).toHaveText('March 2026');

    await month.locator('summary').click();
    const next = page.getByRole('link', { name: 'Next month' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/calMonth=2026-04/);
    await expect(page.locator('#cal-month-label')).toHaveText('April 2026');
    await expect(month).toHaveAttribute('open', '');
    await expect(next).toBeFocused();

    // A day picked from the month shows its week, and the month folds away.
    await page.getByRole('link', { name: 'Thursday 2 April' }).click();
    await expect(page).toHaveURL(/\?week=2026-04-02$/);
    await expect(page.locator('#cal-month-label')).toHaveText('April 2026');
    await expect(month).not.toHaveAttribute('open');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sunday 29' }),
    ).toBeVisible();
  });

  test('keeps the month open beside the week on a wide screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/calendar?week=2026-03-01');
    await expect(page.locator('#cal-month')).toHaveAttribute('open', '');
    await expect(
      page.getByRole('link', { name: 'Previous month' }),
    ).toBeVisible();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('marks worn and removes, landing back on the week', async ({
      page,
    }, info) => {
      const name = unique(info, 'No script');
      await schedule(page.request, name);
      await page.goto(`/calendar?week=${today()}`);
      const chip = page.getByRole('group', { name, exact: true });

      await chip.getByRole('button', { name: 'Worn' }).click();
      await expect(page).toHaveURL(`/calendar?week=${today()}`);
      await expect(chip.getByRole('button', { name: 'Worn' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await chip.getByRole('button', { name: 'Remove from calendar' }).click();
      await expect(page).toHaveURL(`/calendar?week=${today()}`);
      await expect(chip).toHaveCount(0);
    });
  });

  test.describe('in Russian at 320 px', () => {
    test.use({ locale: 'ru-RU' });

    test('keeps the week and the month in the column', async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await schedule(
        page.request,
        `Оченьдлинноеназваниеобразабезединогопробела ${info.project.name}`,
      );
      const week = `/calendar?week=${today()}`;
      for (const path of [week, `${week}&calMonth=${today().slice(0, 7)}`]) {
        await page.goto(path);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path,
        ).toBeLessThanOrEqual(320);
      }
      const cell = await page
        .locator('#cal-month tbody a')
        .first()
        .boundingBox();
      expect(cell!.width).toBeGreaterThanOrEqual(40);
      expect(cell!.height).toBeGreaterThanOrEqual(40);
    });
  });
});
