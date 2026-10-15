const port = process.env.LIGHTHOUSE_PORT ?? '3200';
const origin = `http://localhost:${port}`;

const assertions = {
  // Relax or disable frontend-specific checks for backend APIs
  'network-dependency-tree-insight': 'warn',
  'unminified-javascript': 'warn',
  'unused-javascript': 'warn',
  'render-blocking-resources': 'warn',
  'forced-reflow-insight': 'warn',
  'document-latency-insight': 'warn',
  // Assertions not be necessary
  'unused-css-rules': 'warn',
  'render-blocking-insight': 'warn',
  'image-delivery-insight': 'warn',
  // These audits return null (not applicable) and cannot use minScore
  redirects: 'warn',
  'third-party-facades': 'warn',
  // docs/REDESIGN.md 5.8 and 7
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
  'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
  'total-byte-weight': ['error', { maxNumericValue: 716800 }],
};

const recommended = (matchingUrlPattern, overrides = {}) => ({
  matchingUrlPattern,
  preset: 'lighthouse:recommended',
  aggregationMethod: 'median-run',
  assertions: { ...assertions, ...overrides },
});

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'ts-node scripts/lighthouse-server.ts',
      startServerReadyPattern: 'Seeded wardrobe on',
      // lhci only warns when this runs out, then audits whatever answers.
      startServerReadyTimeout: 120000,
      url: [
        '/',
        '/about',
        '/auth/login',
        '/wardrobe',
        '/wardrobe/new',
        '/outfits',
        // The week scripts/screenshots/seed.ts fills; the current one is empty.
        '/calendar?week=2026-03-01',
      ].map((path) => origin + path),
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertMatrix: [
        recommended(`^${origin}/(about|auth/login)?$`),
        // robots.txt keeps the app's own pages out of search engines.
        recommended(`^${origin}/wardrobe/new$`, { 'is-crawlable': 'off' }),
        // Photos are served at 1080 px into 182 px boxes (docs/BUGS.md).
        recommended(`^${origin}/(wardrobe|outfits|calendar\\?week=[\\d-]+)$`, {
          'is-crawlable': 'off',
          'uses-responsive-images': 'warn',
          'largest-contentful-paint': ['error', { maxNumericValue: 4500 }],
        }),
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
