// The stylesheet, the app's own scripts, the layout's icons and the manifest are asked for with ?v=<revision>
// (src/asset-url.ts), so they are precached under that same URL. An older
// worker's precache has only the bare URL and cannot answer for this build.
// The revision is workbox's md5 of the file, which the server also computes.
const ROOT_FILES = [
  'bundle.css',
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png',
  'manifest.json',
];
const versioned = (url) =>
  ROOT_FILES.includes(url) || /^js\/[^/]+\.js$/.test(url);

module.exports = {
  globDirectory: 'public/',
  globPatterns: ['**/*.{png,webp,css,ico,js,json,txt,woff2,svg}'],
  globIgnores: ['assets/screenshots/**'],
  swDest: 'public/sw.js',
  swSrc: 'views/assets/src-sw.js',
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.map((entry) =>
        versioned(entry.url)
          ? { ...entry, url: `${entry.url}?v=${entry.revision}` }
          : entry,
      ),
      warnings: [],
    }),
  ],
};
