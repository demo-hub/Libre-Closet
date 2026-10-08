module.exports = {
  globDirectory: 'public/',
  globPatterns: ['**/*.{png,webp,css,ico,js,json,txt,woff2,svg}'],
  globIgnores: ['assets/screenshots/**'],
  swDest: 'public/sw.js',
  swSrc: 'views/assets/src-sw.js',
};
