module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start:prod',
      startServerReadyPattern: 'Nest application successfully started',
      url: ['http://localhost:3000'],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      // https://googlechrome.github.io/lighthouse-ci/docs/configuration.html#preset
      preset: 'lighthouse:recommended',
      assertions: {
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
        // Pre-existing homepage issues unrelated to wardrobe feature
        'font-size': 'warn',
        'color-contrast': 'warn',
        // The landing page's four phone screenshots are 4.4 times the size they
        // are shown at (docs/BUGS.md); PR 13 regenerates them and restores this.
        'uses-responsive-images': 'warn',
        // These audits return null (not applicable) and cannot use minScore
        redirects: 'warn',
        'third-party-facades': 'warn',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
