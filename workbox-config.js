// The stylesheet and the app's own scripts are asked for with ?v=<revision>
// (src/asset-url.ts), so they are precached under that same URL. An older
// worker's precache has only the bare URL and cannot answer for this build.
// The revision is workbox's md5 of the file, which the server also computes.
const versioned = (url) => url === 'bundle.css' || /^js\/[^/]+\.js$/.test(url);

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
