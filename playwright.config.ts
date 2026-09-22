import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

// VISUAL=1 runs only the screenshot tests, against a throwaway server (scripts/screenshots/visual.sh).
const visual = !!process.env.VISUAL;
const visualUrl = 'http://localhost:3100';
const ignoreVisual = /visual\.(spec|setup)\.ts$/;
const visualUse = {
  baseURL: visualUrl,
  // Chromium in the pinned Playwright image, so the pixels match on every machine.
  connectOptions: process.env.PW_VISUAL_WS
    ? { wsEndpoint: process.env.PW_VISUAL_WS }
    : undefined,
};

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  expect: {
    /*
     * The import specs wait on a server round trip that fetches a page, fetches
     * an image and re-encodes it — the app's own budget for that is
     * IMPORT_FETCH_TIMEOUT_MS (10 s). Playwright's 5 s default is under it, so
     * on a loaded runner the assertion gave up before the server was ever late.
     */
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  snapshotPathTemplate: 'test/__screenshots__/{projectName}/{arg}{ext}',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: visual
    ? [
        {
          name: 'visual-setup',
          testMatch: /visual\.setup\.ts$/,
          use: { baseURL: visualUrl },
        },
        {
          name: 'visual-desktop',
          testMatch: /visual\.spec\.ts$/,
          dependencies: ['visual-setup'],
          use: {
            ...devices['Desktop Chrome'],
            ...visualUse,
            viewport: { width: 1280, height: 800 },
          },
        },
        {
          name: 'visual-mobile',
          testMatch: /visual\.spec\.ts$/,
          dependencies: ['visual-setup'],
          use: {
            ...devices['Desktop Chrome'],
            ...visualUse,
            viewport: { width: 393, height: 852 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 1,
          },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
          testIgnore: ignoreVisual,
        },

        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
          testIgnore: ignoreVisual,
        },

        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
          testIgnore: ignoreVisual,
        },

        /* Test against mobile viewports. */
        {
          name: 'Mobile Chrome',
          use: { ...devices['Pixel 5'] },
          testIgnore: ignoreVisual,
        },
        {
          name: 'Mobile Safari',
          use: { ...devices['iPhone 12'] },
          testIgnore: ignoreVisual,
        },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        // },
      ],

  /* Run your local dev server before starting the tests */
  webServer: visual
    ? {
        command: 'node scripts/screenshots/visual-server.mjs',
        url: visualUrl,
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        stderr: 'pipe',
      }
    : {
        command: 'npm run build && npm run start:prod',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        stderr: 'pipe',
        env: {
          // url-import.spec.ts serves a fixture shop on 127.0.0.1, which the
          // importer refuses to fetch unless this is set. Never set in production.
          IMPORT_ALLOW_PRIVATE_NETWORKS: 'true',
          // Every project runs the import spec from the same address, so the
          // per-minute ceiling has to sit above the whole suite.
          IMPORT_URL_RATE_LIMIT: '500',
        },
      },
});
